# SmartLight — Mapeamento Técnico da Aplicação

Este documento mapeia toda a aplicação, separando por modalidades/funções, descrevendo os fluxos principais e detalhando como evoluir o projeto com segurança (alterações gerais, novo broker, novos callbacks e novos tópicos MQTT).

## 1) Visão geral da arquitetura

- Frontend e backend rodam no mesmo projeto Next.js (App Router).
- A UI consome rotas `/api/*` internas para autenticação, status e comandos.
- O backend integra com MQTT por meio de `lib/mqtt.ts`.
- Atualizações em tempo real para a UI são enviadas via SSE (`/api/events`), usando `EventEmitter` interno (`lib/events.ts`).

Fluxo macro:

1. Usuário autentica em `/login`.
2. Sessão é criada com `iron-session`.
3. Tela `/control` chama `/api/status` e abre stream em `/api/events`.
4. Ações de controle publicam em tópicos MQTT via `/api/toggle-light`, `/api/toggle`, `/api/wifi`.
5. Callbacks MQTT atualizam estado em memória e disparam eventos SSE para refletir na UI.

---

## 2) Mapa de diretórios e responsabilidade

### `app/`

- `app/page.tsx`: redireciona para `/login`.
- `app/layout.tsx`: layout raiz (tema escuro e metadados).

### `app/login/`

- `app/login/page.tsx`: formulário de login.
- `app/api/login/route.ts`: valida credenciais (`ADMIN_USER` / `ADMIN_PASS`) e marca `session.authed = true`.

### `app/control/`

- `app/control/page.tsx`: valida sessão e renderiza painel principal.
- `app/control/toggle-card.tsx`: controle geral de luzes, abertura do modal de 16 luzes, consumo de SSE e estado local da tela.
- `app/control/components/light-grid-modal.tsx`: modal acessível para ligar/desligar cada luz.
- `app/control/heartbeat-card.tsx`: status de heartbeat (online/offline, uptime, wifi).
- `app/control/helpers/light-grid.ts`: constantes e helpers de grade (`LIGHT_COUNT = 16`).

### `app/wifi/`

- `app/wifi/page.tsx`: tela protegida por sessão.
- `app/wifi/form.tsx`: validação client-side e envio de Wi-Fi.
- `app/api/wifi/route.ts`: validação server-side e publicação MQTT de credenciais.

### `app/api/`

- `status/route.ts`: retorna snapshot atual (`on`, `lights`, `heartbeat`).
- `events/route.ts`: stream SSE para eventos MQTT.
- `toggle/route.ts`: toggle global.
- `toggle-light/route.ts`: toggle individual por luz.
- `logout/route.ts`: destrói sessão.

### `lib/`

- `lib/mqtt.ts`: núcleo de integração MQTT (conexão, publish, subscribe, parse de callbacks, estado em memória).
- `lib/events.ts`: barramento de eventos com `EventEmitter`.
- `lib/session.ts`: opções de sessão (`iron-session`).

### `components/ui/`

Componentes de UI reutilizáveis e navegação lateral/mobile (`sidebar`, `mobile-nav`, `logout-button`, etc.).

### Arquivos legados/utilitários

- `server.js`: servidor Express legado (não é o fluxo principal com App Router).
- `mqtt-pubsub.js`: script auxiliar para testes manuais/pubsub MQTT.

---

## 3) Modalidades/Funções da aplicação

## 3.1 Autenticação e sessão

Objetivo: proteger rotas de controle e API.

- Entrada: `POST /api/login` com `username` e `password`.
- Persistência: cookie com `iron-session` (`lighton_session`).
- Proteção:
  - Páginas: `/control` e `/wifi` verificam `session.authed`.
  - APIs protegidas: `/api/status`, `/api/toggle`, `/api/toggle-light`, `/api/wifi`.
- Saída: `POST /api/logout` destrói sessão.

## 3.2 Controle de iluminação (global e individual)

Objetivo: controlar 16 luzes com feedback assíncrono.

- Global:
  - API: `POST /api/toggle`.
  - Publica comando textual em `MQTT_TOPIC`.
  - Aguarda confirmação em `MQTT_RESPONSE_TOPIC` com timeout.
- Individual:
  - API: `POST /api/toggle-light` com `{ lightId, on }`.
  - Publica JSON em `MQTT_REQUEST_TOPIC`.
  - Aguarda callback em `MQTT_SINGLE_LIGHT_CALLBACK_TOPIC`.
- Estado em memória:
  - `toggleOn` para luz principal/global.
  - `lightStates` para 16 luzes (`Record<number, boolean>`).

## 3.3 Heartbeat e telemetria do dispositivo

Objetivo: detectar online/offline e exibir metadados.

- Subscribe em `MQTT_HEARTBEAT_TOPIC`.
- Parse tolerante em `parseHeartbeat` (status, uptime, timestamp, wifi).
- Estado em memória `heartbeatState` com:
  - `topic`,
  - `lastSeenAt`,
  - `payload`.
- UI usa:
  - SSE (`/api/events`) para atualização em tempo real.
  - Polling em `/api/status` para resiliência (`NEXT_PUBLIC_HEARTBEAT_POLL_MS`).
  - Janela de staleness (`NEXT_PUBLIC_HEARTBEAT_STALE_MS`) para considerar offline.

## 3.4 Configuração de Wi-Fi

Objetivo: provisionar SSID/senha para o dispositivo.

- UI em `/wifi` com validação local.
- API valida limites (SSID até 32, senha 8..64).
- Publicação em `MQTT_WIFI_TOPIC` com payload JSON.

## 3.5 Entrega de eventos em tempo real (SSE)

Objetivo: manter painel sincronizado sem refresh manual.

- `/api/events` cria `ReadableStream` e envia:
  - snapshot inicial de `getStatus()`,
  - pings keepalive (`:ping`),
  - eventos emitidos no `bus`.
- `lib/mqtt.ts` emite no `bus` quando recebe callback/heartbeat.

---

## 4) Tópicos MQTT atuais (catálogo)

- `MQTT_TOPIC` (default `v2050/request/vidanovajs`)
  - Uso: comando global de luz.
- `MQTT_RESPONSE_TOPIC` (default `v2050/response/lightingvidanova`)
  - Uso: confirmação de comando global.
- `MQTT_REQUEST_TOPIC` (default `v1/client/request/singleLight`)
  - Uso: comando individual de luz.
- `MQTT_SINGLE_LIGHT_CALLBACK_TOPIC` (default `v1/client/callback/singleLight`)
  - Uso: callback individual de luz.
- `MQTT_HEARTBEAT_TOPIC` (sem default útil; precisa ser configurado para subscrever)
  - Uso: heartbeat do dispositivo.
- `MQTT_WIFI_TOPIC` (default `v2050/request/wifi`)
  - Uso: envio de credenciais de Wi‑Fi.

Observação: todos os defaults estão concentrados em `lib/mqtt.ts`, o que facilita rastreabilidade.

---

## 5) Fluxos detalhados (fim a fim)

## 5.1 Login

1. `app/login/page.tsx` envia `POST /api/login`.
2. `app/api/login/route.ts` compara credenciais com env.
3. Se válido, grava sessão (`session.authed = true`) e retorna `{ ok: true }`.
4. Frontend redireciona para `/control`.

## 5.2 Toggle individual de luz

1. UI chama `POST /api/toggle-light` com `{ lightId, on }`.
2. API valida sessão + payload.
3. API chama `publishLightState(lightId, on)`.
4. `lib/mqtt.ts`:
   - gera `requestId`,
   - publica comando em `MQTT_REQUEST_TOPIC`,
   - aguarda callback em `MQTT_SINGLE_LIGHT_CALLBACK_TOPIC`.
5. Ao receber callback válido:
   - atualiza `lightStates`,
   - emite evento `light-grid`,
   - emite evento `single-light-callback`.
6. SSE entrega evento para UI; UI atualiza estado e feedback.

## 5.3 Heartbeat

1. Broker publica em `MQTT_HEARTBEAT_TOPIC`.
2. `lib/mqtt.ts` detecta match de tópico (suporta wildcard `#` e `+`).
3. `parseHeartbeat` normaliza payload.
4. Atualiza `heartbeatState.lastSeenAt` e `payload`.
5. Emite evento `kind: "heartbeat"` no `bus`.
6. UI atualiza card e calcula online/offline pelo tempo de staleness.

---

## 6) Como fazer alterações com segurança

Sequência recomendada para qualquer mudança:

1. Identificar modalidade afetada:
   - autenticação,
   - controle de luz,
   - heartbeat,
   - wifi,
   - UI/SSE.
2. Atualizar contrato de API primeiro (entrada/saída).
3. Ajustar integração MQTT (`lib/mqtt.ts`) mantendo compatibilidade.
4. Ajustar UI para novo contrato.
5. Validar impactos em:
   - `/api/status`,
   - `/api/events`,
   - parsing de callback.
6. Validar envs necessários.

Pontos de atenção:

- Estado é em memória de processo (não persistente).
- Timeout de callback impacta UX.
- Mensagens MQTT podem variar em formato; parser precisa ser defensivo.

---

## 7) Guia: adicionar novo broker MQTT

Situação comum: trocar host/porta/credencial ou ambiente.

Passos:

1. Ajustar variáveis de ambiente:
   - `MQTT_BROKER`,
   - `MQTT_PORT` (se aplicável),
   - `MQTT_USER`,
   - `MQTT_PASSWORD`.
2. Garantir formato:
   - `resolveBrokerUrl()` aceita com ou sem protocolo e normaliza para `mqtt://`.
3. Revisar conexão em `ensureClient()` (`lib/mqtt.ts`) para opções adicionais (TLS, clientId, clean session) se necessário.
4. Verificar subscribe dos tópicos essenciais no `connect`.
5. Validar reconexão (`reconnectPeriod`) e logs de erro.

Se houver múltiplos brokers por funcionalidade:

- Evoluir `lib/mqtt.ts` para factory de clientes por domínio (`control`, `heartbeat`, etc.).
- Manter interface pública (`publishLightState`, `getStatus`, etc.) estável para não quebrar APIs.

---

## 8) Guia: adicionar novo callback MQTT

Exemplo: dispositivo passa a enviar callback de temperatura.

Passos:

1. Definir novo tópico/env:
   - ex.: `MQTT_TEMPERATURE_CALLBACK_TOPIC`.
2. Incluir subscribe em `client.on("connect")`.
3. No `client.on("message")`, criar branch para o tópico.
4. Implementar parser dedicado (ex.: `parseTemperatureCallback`).
5. Atualizar estado em memória (novo estado local em `lib/mqtt.ts`).
6. Emitir evento no `bus` com `kind` específico (ex.: `temperature`).
7. Expor no `getStatus()` se a UI precisar snapshot inicial.
8. Consumir no frontend via SSE e/ou polling.

Boas práticas:

- Parser tolerante a payload parcial/inválido.
- Não quebrar callbacks existentes.
- Padronizar shape dos eventos (`kind`, payload normalizado, topic/raw quando útil).

---

## 9) Guia: adicionar novo tópico/comando MQTT

Passos:

1. Definir variável de ambiente do novo tópico.
2. Declarar constante em `lib/mqtt.ts` com fallback coerente.
3. Implementar função de publish/subscription dedicada.
4. Criar/ajustar rota API em `app/api/*` (se houver acionamento pela UI).
5. Integrar na UI (botão/form/modal) com tratamento de erro.
6. Propagar atualização em tempo real via `bus` + `/api/events`.

Checklist mínimo de contrato:

- Input validado na API.
- Timeout definido para callback esperado.
- Retorno API consistente (`ok`, `message`, `topic`, estado atual quando aplicável).

---

## 10) Contratos principais (resumo rápido)

- `GET /api/status`
  - retorno: `{ on, topic, heartbeat, lights }`.
- `POST /api/toggle-light`
  - entrada: `{ lightId, on }`
  - retorno: `{ ok, message, lightId, on, topic, requestId?, lights }`.
- `POST /api/toggle`
  - retorno: `{ ok, on, topic, message, lights }`.
- `POST /api/wifi`
  - entrada: `{ ssid, password }`
  - retorno: `{ ok: true }` ou erro validado.
- `GET /api/events`
  - stream SSE com eventos `toggle`, `light-grid`, `single-light-callback`, `heartbeat`.

---

## 11) Variáveis de ambiente (referência)

Autenticação:

- `ADMIN_USER`
- `ADMIN_PASS`
- `SESSION_SECRET`

MQTT:

- `MQTT_BROKER`
- `MQTT_PORT`
- `MQTT_USER`
- `MQTT_PASSWORD`
- `MQTT_TOPIC`
- `MQTT_RESPONSE_TOPIC`
- `MQTT_REQUEST_TOPIC`
- `MQTT_SINGLE_LIGHT_CALLBACK_TOPIC`
- `MQTT_HEARTBEAT_TOPIC`
- `MQTT_WIFI_TOPIC`

Frontend heartbeat:

- `NEXT_PUBLIC_HEARTBEAT_STALE_MS`
- `NEXT_PUBLIC_HEARTBEAT_POLL_MS`

---

## 12) Decisões técnicas atuais e implicações

- Estado MQTT mantido em memória do processo:
  - simples e rápido,
  - não compartilhado entre múltiplas instâncias.
- SSE + polling no heartbeat:
  - boa responsividade,
  - robusto contra perda de evento.
- Parse defensivo de callbacks:
  - reduz falhas por payload inconsistente,
  - exige manutenção contínua de normalização.

---

## 13) Pontos críticos para manutenção

- `lib/mqtt.ts` é o ponto central mais sensível (broker, tópicos, callback, estado, eventos).
- Mudanças de contrato MQTT devem ser refletidas em:
  - parser,
  - rotas API,
  - tipos e UX no frontend.
- Mudanças de autenticação devem manter coerência entre:
  - `/api/login`,
  - guards de página (`/control`, `/wifi`),
  - guards de API.

---

## 14) Roadmap de evolução (baseado no desenho atual)

- Extrair domínio MQTT por contexto (lighting, heartbeat, wifi).
- Tipar eventos SSE com discriminated unions completas entre backend/frontend.
- Adicionar testes de parsing de callbacks MQTT e de contratos das rotas.
- Revisar e aposentar arquivos legados (`server.js`) quando não houver dependência operacional.
