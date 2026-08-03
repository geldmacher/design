# Design

`geldmacher-design` ist ein lokales Cursor-Plugin fuer die Designarbeit an Websites und Web-Apps. Es verpackt den gepinnten Impeccable-Cursor-Skill und ergaenzt einen stabilen Router, projektbezogene Diagnose, opt-in Hook-Aktivierung und eine kuratierte Modularchitektur.

## Einstieg

- `/design <Anfrage>` routet zur engsten kuratierten Faehigkeit; allgemeine Designarbeit faellt auf Impeccable zurueck.
- `/design setup` prueft den Projektzustand und schreibt erst nach einer ausdruecklichen Bestaetigung.
- `/design status` und `/design doctor` sind read-only.
- `/impeccable` bleibt der direkte Upstream-Einstieg.

Gemeinsamer Projektkontext bleibt ausschliesslich `PRODUCT.md`, `DESIGN.md` und `.impeccable/`. Das Plugin fuehrt kein paralleles Kontextformat ein.

## Grenzen von Version 0.1.0

- Web und Web-Apps; native iOS-/Android-Faehigkeiten werden nicht beworben.
- Impeccable `skill-v4.0.4` ist vendet und gepinnt.
- Keine Emil-Skills, kein MCP und keine dynamischen Laufzeitmodule.
- Keine Selbstupdates oder Netzwerkzugriffe bei normaler Nutzung und im Release-Check.
- Kein automatisches Entfernen projektlokaler Impeccable-Installationen oder doppelter Hooks.

## Entwicklung

Node 22 oder neuer ist die Entwicklungs- und Hook-Baseline.

```bash
npm ci
npm run release-check
git diff --check
```

Ein Maintainer-Sync ist ein separater, ausdruecklicher Vorgang. Details stehen in [upstream/README.md](upstream/README.md). Repository-Gates ersetzen nicht den dokumentierten Cursor-Live-Smoke.
