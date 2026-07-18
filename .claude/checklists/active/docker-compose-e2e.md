# Docker Compose de ponta a ponta

Foi só testado API (sqlite direto via `uvicorn`) e frontend (`npm run dev` direto) separadamente,
nunca os três serviços juntos containerizados.

- [ ] Rodar `docker compose up -d --build`
- [ ] Os 3 serviços sobem sem erro
- [ ] `http://localhost:8000/health` responde
- [ ] Frontend em `http://localhost:3000` carrega os dados via a API containerizada (lendo
      `pipeline/data/gold/` pelo volume montado, não via sqlite local)
