# Deploy — NAQIB Daily Bot v2 (Slice 7)

One always-on Python process on an **Oracle Always Free VM**, polling Telegram
outbound (no inbound port). This reuses Teleport's already-prepped host plan.

Prerequisites (done): `Dockerfile`, `docker-compose.yml`, `.dockerignore`,
`.env.example` are in this folder. `tzdata` is in `requirements.txt` (the slim
base image otherwise lacks the KL timezone database).

## Two blocking decisions (need you, Naqib)

1. **The VM.** Teleport prepped an `ed25519` SSH key (`teleport_oci`) + compose
   file, but the Oracle VM itself was "pending your OCI signup". To finish you
   need to sign in to Oracle Cloud, create an Always Free VM (Ampere A1 or a
   free x86 e2.micro/AMD), and give me (or the deploy step) its SSH access.

2. **The bot token.** v2 currently tests on **@A7Prod_bot's token** (Teleport's).
   The single-poller rule: *exactly one* process may poll a Telegram token. So
   before v2 goes live we either (a) stop Teleport + 6a first, or (b) create a
   fresh `@BotFather` bot for v2 and use that token. (b) is cleaner and was an
   open Phase-3 item ("new project name, cosmetic").

## Phase 1 — VM up  (you + OCI console)

- Oracle Cloud → create **Always Free** instance (Ubuntu 24.04 recommended).
- Add your SSH public key; note the public IP.
- Open **no** inbound ports (the bot dials out only).

## Phase 2 — Docker on the VM  (once)

```bash
ssh ubuntu@<VM_IP>
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER && newgrp docker
```

## Phase 3 — code + secrets

```bash
git clone <repo-url> && cd Material_logi/dailybot
cp .env.example .env && nano .env   # fill TELEGRAM_BOT_TOKEN, NAQIB_CHAT_ID, GROQ_API_KEY
```

`.env` is gitignored and docker-ignored — it never leaves the VM or the image.

## Phase 4 — run

```bash
docker compose up -d --build
docker compose logs -f    # watch it arm the KL scheduler
```

`data/` persists via the bind mount; `topics.json` comes from the clone.

## Phase 5 — live smoke test (the Slice 7 proof)

1. Logs show `getMe 200` + `Scheduler armed: midday 13:15 … (KL)`.
2. In Telegram, send `/test` → the midday question arrives → reply → `/status`
   shows it stored, and `data/daily/<today>.json` gains the answer.
3. Send `/weekly` → a real `.docx` comes back.
4. The real proof is one **wall-clock** touchpoint: wait for (or fast-check) a
   13:15 KL midday fire in the logs without touching anything.

## Phase 6 — cutover (single-poller rule)

- Stop Teleport's and 6a's running instances *before* or *at* v2 go-live.
- Archive the `lh_bot_6a` and `teleport` repos once v2 has run a real week +
  produced a real `.docx` you've read.

## Definition of done (from the pipeline)

A real week ran through the real bot on the real VM, produced a real `.docx`,
you read it and confirmed it, and `lh_bot_6a` + `teleport` are archived.