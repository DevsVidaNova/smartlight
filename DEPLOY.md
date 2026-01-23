# Deploy na Vercel

## Pré-requisitos
- Conta Vercel
- Vercel CLI opcional
- Variáveis de ambiente configuradas

## Variáveis de ambiente
Veja `.env.example` e crie variáveis no projeto Vercel:
- ADMIN_USER
- ADMIN_PASS
- SESSION_SECRET
- MQTT_BROKER
- MQTT_TOPIC
- MQTT_RESPONSE_TOPIC
- MQTT_WIFI_TOPIC

## Passos
1. Faça push para um repositório (GitHub/GitLab/Bitbucket)
2. Importar o projeto na Vercel
3. Framework: Next.js (auto)
4. Build: `next build` (auto)
5. Defina as variáveis de ambiente
6. Deploy

## Observações
- Rotas API usam runtime `nodejs` para suportar MQTT e iron-session
- SSE em `/api/events` funciona com streaming
- MQTT mantém conexão por instância; não persiste entre reinstâncias

