# EV-CHECK-PALETTE — PASS de tranche, 2026-10-01

Base 1b2cbbe. Tranche H08.2/4, parents non clos.

17 ciblés terminal UX/providers/garde différentiel PASS ; /tmp/cuesheet-check-palette-targeted-final.log. Le cas Ink emploie le vrai App, producer, journal et check épinglé, avec frappes Ctrl+K, flèches, Entrée, Escape et C. Opening ne confirme rien ; Escape ne change aucune révision. Une correction authoritative injectée au journal pendant l’affichage du snapshot fait refuser l’ancienne confirmation sans append. Une confirmation fraîche renouvelle le même objectif. Trois tailles avec resize réel 40×14, 80×24, 120×36 conservent le footer et le nombre de lignes borne l’écran.

La correction injectée est un entrelacement contrôleur de test, pas un deuxième processus ni un message privé d’agent. Une correction par producer.say fermerait la palette par le comportement submit existant ; le test cible une révision de contrat changée sans fermer la vue, comme une mise à jour async.

Pas de nouveau diagnostic TypeScript ; baseline globale conservée. Solo review des snapshot copies, hooks/clipping/resize, action humaine séparée de l’ouverture et admission dans producer.say. Full regression : 740 tests, 738 pass, 0 fail, 2 skipped, 32.7 s ; /tmp/cuesheet-check-palette-all.log. Diff --check PASS. Pas de mutation core ni fichier de check arbitraire. L’action n’exécute/reprend aucun travail et les critères modèle sont étiquetés sans autorité indépendante.
