# Threat model: the boundary a hostile worker would meet

Current model (P0 to P15): the worker is **semantically unreliable**. It may lie,
it may produce the wrong artifact, it may claim success having done nothing. It
is not a process with OS access we intend to treat as hostile, because it runs
as the same user as the runtime, with the runtime's own permissions.

This document does not change that model and implements nothing. It states where
the limit actually is today, what each OS really offers to move that limit, and
the one sentence that says when we owe ourselves the move.

Every claim below is labelled by how it was established. `observed here` means
run on this machine and reproducible with the command shown. `documented` means
read in the cited man page or official documentation. `inference` means a
conclusion I drew and did not verify, and it is marked as such on purpose.

---

## PROVEN

### What this repository does today

**There is no sandbox anywhere in the code path that starts a worker.**
`src/adapters/worker-launcher.ts:104` calls `spawn()` with exactly two options:
`stdio` and `env`. No `cwd`, no uid change, no confinement primitive. The
worker's writable set is therefore whatever the launching user can already
write, which on a developer machine is most of the home directory.

**The worker's environment is the launcher's environment, whole.**
`src/adapters/worker-launcher.ts:95` spreads `...process.env` into the child env.
Same at `src/adapters/shell.ts:110`. Every credential present in the launcher's
environment is readable by the worker.

**A code comment claims a boundary that no code enforces.**
`src/adapters/worker-launcher.ts:99-101` reads: "The worker's only writable
surface. WRK-02: it is handed a directory and an identity, and the session store
is not reachable from either." The first half is true of what is *handed*. The
second half is false of the machine: `HOME` arrives through the inherited
environment, the process runs as the same uid, and nothing stops it from opening
a path under `$HOME` by name. I did not open anything to check, and the packet
forbids it. What is proven is that the *path namespace* is fully reachable.
This comment should be corrected on its own, independent of any sandbox.

**`ShellToolRunner` constrains paths, not processes, and one input shape escapes
the path checks entirely.** `src/adapters/shell.ts:7` says so itself: "this
runner does not sandbox, it constrains". Concretely: the allow list at
`src/adapters/shell.ts:62` matches on the tool *name* only, the root checks at
`src/adapters/shell.ts:74` and `:88` look only at `cwd` and `input.path`, and
`src/adapters/shell.ts:145` returns `input.argv` verbatim when the caller
supplied one. So the effective policy is "this tool name may run any argv",
which is a naming policy rather than a capability policy.

**Coverage is already declared as bounded, and the bound is written in code.**
`src/adapters/artifact-capture.ts:196` (`COVERAGE_LIMITS`) already names the
three things a capture is not evidence of: writes outside the declared
workspace, effects on processes or the network or any other machine state, and
anything done in a workspace the worker was not given. This document does not
contradict that list, it explains what would be needed to shrink it.

**Attribution failures degrade to INCONCLUSIVE, they do not become false
success.** A receipt claiming the wrong `effectId` fails the first check at
`src/verify.ts:148` and yields INCONCLUSIVE; a receipt whose digest moved yields
INCONCLUSIVE at `src/verify.ts:165`. That is why an untrusted worker cannot
currently forge a VERIFIED verdict by lying about its identity. It can only make
its own work unverifiable.

### macOS, observed here on this machine

Environment: `macOS 27.0`, build `26A428`, `arm64`, `/usr/bin/sandbox-exec`
present at `/usr/bin/sandbox-exec`.

1. **The public API is marked unsupported.** `$(xcrun --show-sdk-path)/usr/include/sandbox.h`
   carries `API_DEPRECATED("No longer supported", macos(10.5, 10.8), ios(2.0, 6.0), ...)`
   on both `sandbox_init` and `sandbox_free_error`. The file header itself says
   "This header is deprecated and may be removed in a future release."
2. **The command line tool is marked deprecated in its own man page.**
   `/usr/share/man/man1/sandbox-exec.1`, dated March 9 2017: `execute within a
   sandbox (DEPRECATED)`, with the body "The sandbox-exec command is DEPRECATED.
   Developers who wish to sandbox an app should instead adopt the App Sandbox
   feature described in the App Sandbox Design Guide."
3. **The private headers are not in the public SDK.** No `sandbox_private.h`,
   no `seatbelt.h` under the SDK include path. The private entry points are not
   reachable from a signed binary without a private entitlement.
4. **Semantics are documented in `sandbox(7)`** (`/usr/share/man/man7/sandbox.7`):
   the facility "allows applications to *voluntarily* restrict their access";
   "It is not a replacement for other operating system access controls";
   restrictions are "generally enforced upon acquisition of operating system
   resources only", so "if the application already has a file descriptor opened
   for writing, it may use that file descriptor regardless of restrictions";
   and "New processes inherit the sandbox of their parent."
5. **The supported path is per-app, not per-process.** Apple, *Enabling App
   Sandbox*, Entitlement Key Reference (Documentation Archive, page dated
   2017-03-27): entitlements are "incorporated into the target's code signature
   when you build the project", `com.apple.security.app-sandbox` is the enabling
   key, network egress is two separate keys (`com.apple.security.network.client`
   and `.server`), child inheritance is opt-in via `com.apple.security.inherit`,
   and a violation is logged by `sandboxd`. An arbitrary `node` worker started by
   a CLI is not an Xcode target with a sandbox entitlement, so this is not
   available to us as things stand.
6. **Observed: deprecation is not enforced.** `sandbox-exec` still applies and
   still refuses. Reproducible:

   ```text
   # control: mechanism is alive
   sandbox-exec -p '(version 1)(allow default)' /bin/echo CONTROL_OK
   -> CONTROL_OK, exit 0

   # writes are refused by the kernel, and no file is created
   sandbox-exec -p '(version 1)(allow default)(deny file-write*)' \
     /usr/bin/touch /var/folders/.../T/opencode/seatbelt-probe.txt
   -> touch: ... Operation not permitted ; no file on disk afterwards

   # a deny-default profile denies exec itself
   sandbox-exec -p '(version 1)(deny default)' /usr/bin/true
   -> sandbox-exec: execvp() of '/usr/bin/true' failed: Operation not permitted
   -> exit 71
   ```

7. **Observed negative, and it is the expensive one.** A minimal allow-list
   profile granting `process-exec*` plus selected `file-read*` subpaths
   (`/bin`, `/System`, `/usr/lib`, `/Library/Preferences`, `/private/var/db`,
   `/private/etc`) killed `/bin/echo` with SIGABRT (exit 134), twice, with no
   policy error and no diagnostic. The dynamic loader needs more than file read
   rules, and the failure mode is a crash rather than a denial. A hand-written
   allow-list profile is therefore a project with its own investigation, not a
   configuration line.
8. **Observed: `network-outbound` is a real profile operation here, with a
   negative control so the claim is not decoration.** An unknown operation name
   is rejected outright: `(deny totally-not-an-op)` gives
   `sandbox-exec: unbound variable: totally-not-an-op`. The same parser accepts
   `(deny network-outbound)` and starts the child. So egress is expressible in
   the profile. What I did *not* test is that a real outbound connection is
   blocked, because that would mean making one; recognition and enforcement are
   two claims and only the first is observed.

### Linux, documented only, not executable in this environment

I have no Linux host here and did not try to fake one. Everything in this block
is read from official documentation and is **unverified by execution**.

1. **Namespaces** (`unshare(2)`, man-pages 6.19): `CLONE_NEWNS`, `CLONE_NEWPID`,
   `CLONE_NEWNET`, `CLONE_NEWUSER`, `CLONE_NEWIPC`, `CLONE_NEWUTS`,
   `CLONE_NEWCGROUP`, `CLONE_NEWTIME`. "Creating all kinds of namespace, except
   user namespaces, requires the `CAP_SYS_ADMIN` capability. However, since
   creating a user namespace automatically confers a full set of capabilities,
   creating both a user namespace and any other type of namespace in the same
   `unshare()` call does not require the `CAP_SYS_ADMIN` capability in the
   original namespace."
2. **Network scope** (`network_namespaces(7)`, man-pages 6.19): a network
   namespace isolates "network devices, IPv4 and IPv6 protocol stacks, IP
   routing tables, firewall rules, the `/proc/net` directory, the
   `/sys/class/net` directory, various files under `/proc/sys/net`, port numbers
   (sockets)" and "the UNIX domain abstract socket namespace". Requires
   `CONFIG_NET_NS`.
3. **Syscall filter** (`seccomp(2)`, man-pages 6.19): a BPF program;
   `SECCOMP_SET_MODE_FILTER` requires `CAP_SYS_ADMIN` or `no_new_privs`;
   "If `fork(2)` or `clone(2)` is allowed by the filter, any child processes will
   be constrained to the same system call filters as the parent. If `execve(2)`
   is allowed, the existing filters will be preserved"; "It is strongly
   recommended to use an allow-list approach"; `SECCOMP_FILTER_FLAG_TSYNC` is
   needed to cover a multithreaded process.
4. **Filesystem and network LSM** (Landlock, kernel.org documentation, version
   7.3.0-rc5 tree, page dated August 2026): unprivileged, stackable; filesystem
   rules; network rules since ABI v4 (TCP) and ABI v10 (UDP);
   `landlock_restrict_self()` binds "the current thread and its future
   children"; "Once a thread is landlocked, there is no way to remove its
   security policy"; `no_new_privs` is required for an unprivileged process and
   is recommended even when it is not, because set-user-ID binaries otherwise
   become confused deputies; and "Landlock enables restricting access to file
   hierarchies, which means that these access rights can be propagated with bind
   mounts but not with Overlay Filesystem".
5. **User-space container** (`bwrap(1)`, bubblewrap 0.12 / 0.13, Debian
   manpages): "a unprivileged low-level sandboxing tool"; it works "by creating
   a new, completely empty, filesystem namespace where the root is on a tmpfs
   that is invisible from the host, and which will be automatically cleaned up
   when the last process exits"; `--unshare-all` gives `--unshare-user-try --unshare-ipc --unshare-pid
   --unshare-net --unshare-uts --unshare-cgroup-try`;
   `--ro-bind` and `--bind` for filesystem scope; `--clearenv` exists and unsets
   everything except `PWD`; `--disable-userns` prevents the sandbox from
   rearranging the namespace afterwards; `--die-with-parent` ties lifetime to the
   launcher; and the man page explicitly recommends seccomp over `TIOCSTI` or
   `--new-session` "otherwise the application can feed keyboard input to the
   terminal which can e.g. lead to out-of-sandbox command execution (see
   CVE-2017-5226)".

### Summary of the gap between the platforms

| Capability | macOS | Linux |
|---|---|---|
| Confine an arbitrary process tree | Deprecated interface, observed working, unsupported | Unprivileged and supported (`bwrap`, Landlock, seccomp, namespaces) |
| Filesystem scope | Seatbelt profile, must be hand-written | mount namespace or Landlock rules |
| Network scope | Seatbelt profile; `network-outbound` observed as a real operation, enforcement of a live connection not tested | network namespace, or Landlock per port from ABI v4 / v10 |
| Env and secrets | Constructed by us, no OS help | `--clearenv`, or constructed by us |
| Subprocess inheritance | Inherited, documented | Inherited, documented |

---

## ASSUMED

Each of these is a current assumption, not a proven property. Each one names what
breaks with it, because an assumption with no stated consequence is a belief.

1. **The launching user is trusted.** The runtime and the worker share a uid. A
   sandbox restricts the worker, never the user, so nothing here protects
   against a hostile *user*. Consequence if false: the whole model is wrong and
   no per-process primitive helps.
2. **A worker cannot forge a verdict, only make work unverifiable.** Proven for
   the `effectId` and digest checks in `src/verify.ts`, and assumed for
   everything downstream of them: the capture digest is computed by the runtime
   over bytes the runtime read (`src/adapters/artifact-capture.ts:156`), and the
   verifier runs with its `cwd` set to the capture
   (`src/adapters/artifact-verifier.ts:69`). Consequence if false: a worker that
   can influence what the runtime captures can influence the verdict.
3. **The receipt directory is where receipts go, not the only place the worker
   can write.** This is what `WRK-02` means in practice today. Consequence if
   false, in the sense of being wrong: we are already relying on capture
   integrity rather than on write confinement, which is the design intent but is
   nowhere stated as a threat model.
4. **Time, CPU, memory and disk are unbounded for a worker.**
   `src/adapters/worker-launcher.ts` has no timeout option, unlike
   `src/adapters/shell.ts:45`, which caps tools at 120s. Consequence if false:
   a worker can exhaust the machine without ever lying, and every invariant
   above stays true while the session dies.
5. **A worker does not need the network.** No code enforces this; nothing in the
   repo has needed it. Consequence if false: this is the assumption a real
   sandbox would cost the most to keep, because egress rules are the fiddliest
   part of every option above.

---

## NOT COVERED

Nothing here is claimed to be covered by the current design.

1. **Every effect outside the declared workspace.** Already declared in
   `src/adapters/artifact-capture.ts:196`. Unchanged by this document.
2. **Inherited environment and secrets.** Proven above: the whole parent
   environment is handed to the worker. The cheap mitigation is not a sandbox,
   it is constructing the environment explicitly, and `bwrap(1)` shows the shape
   of that on Linux (`--clearenv` then `--setenv`).
3. **Open file descriptors that predate confinement.** `sandbox(7)`: an already
   open write descriptor "may use that file descriptor regardless of
   restrictions". So on macOS the confinement must be established before any
   handle the worker should not have is opened. The current launcher pipes
   stdio and opens nothing else, which is lucky rather than designed.
4. **Escape through an unsandboxed neighbour.** *Inference, not verified.* A
   sandbox restricts a process and its descendants; it does not stop that
   process from asking something already running on the machine to act. I found
   no source in the documents above that settles this, so I am not asserting it
   is possible, only that no primitive above is designed to prevent it.
5. **Re-entrant namespace creation on Linux.** Documented in `bwrap(1)`:
   `--disable-userns` exists precisely because the sandboxed process could
   otherwise create further user namespaces and "rearrange the filesystem
   namespace". A confinement built on namespaces that omits this is decorative.
6. **OverlayFS is not covered by Landlock rules.** Documented in the Landlock
   documentation. If a worker workspace is ever presented as an overlay mount
   rather than a bind mount, filesystem confinement silently stops applying.
7. **Terminal injection on Linux.** Documented in `bwrap(1)`, with a CVE
   reference, unless `--new-session` or a `TIOCSTI` seccomp rule is used.
8. **Landlock ABI drift.** Landlock access rights are versioned by ABI and the
   documented pattern is to degrade to the subset the running kernel supports.
   A confinement built on ABI v10 UDP rules behaves differently on a v6 kernel,
   silently, and "degrades gracefully" is a security decision, not a comfort.
9. **Whether Apple will remove `sandbox-exec`.** Unknown. Deprecation is not
   removal: the interface works on 27.0, and no removal date is published in
   anything I read. Depending on it is a bet on an unannounced schedule.
10. **Everything about Linux behaviour in practice.** Documented, never run
    here. No claim in this document about Linux is backed by an observation.
11. **The hand-written macOS profile path.** Observed once to be harder than it
    looks (SIGABRT, no diagnostic). Not characterised, not attempted beyond that.

---

## WAKE CONDITION

A worker that runs real code on a real workspace receives an OS capability that
we would have to treat as hostile in order to keep: a credential in its
environment, a path outside its declared roots, or a network egress it was never
granted.

Fired concretely, by any one of these, with no judgement call:

- a brief that cannot be admitted because admitting it would mean granting the
  worker something we refuse to hand over;
- a finding that a worker created or modified a file outside its declared
  workspace, on any platform, whether or not the file mattered;
- a second worker in the same session needing a different set of permissions
  than the first, which makes the single inherited environment wrong rather
  than merely generous;
- an incident where a worker's own report was the only evidence of what it
  touched.

Not a trigger: wanting a sandbox for tidiness, wanting one for defence in depth,
or a milestone number. The boundary moves when something crosses it.