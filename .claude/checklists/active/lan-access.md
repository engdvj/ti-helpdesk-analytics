# Acesso de outro PC na rede interna (10.17.200.7)

`docker compose up -d --build` já sobe os 3 serviços com `web`/`api` publicados
em todas as interfaces (`0.0.0.0:3000`/`0.0.0.0:8000`, confirmado via
`docker compose ps`), e o bundle do frontend já embute
`NEXT_PUBLIC_API_URL=http://10.17.200.7:8000` (não `localhost`) - conferido
direto no `.js` gerado. `.env`/`.env.example` documentam o padrão.

O que não consegui confirmar sem sessão elevada (a sessão que fez essa
mudança não tinha permissão de admin do Windows pra ler `Get-NetFirewallRule`):

- [ ] Confirmar que o Firewall do Windows deixa passar conexão de entrada nas
      portas 3000/8000 - a máquina está no perfil `DomainAuthenticated`
      (domínio do hospital), então pode já estar liberado por GPO ou pode
      precisar de uma regra manual. Testar de outro PC na rede:
      `http://10.17.200.7:3000` no navegador, ou
      `Test-NetConnection 10.17.200.7 -Port 3000` no PowerShell.
- [ ] Se bloqueado, rodar num PowerShell **administrador** na máquina que
      hospeda o docker compose:
      ```powershell
      New-NetFirewallRule -DisplayName "TI Analytics web" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
      New-NetFirewallRule -DisplayName "TI Analytics api" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
      ```
- [ ] Se a máquina muda de IP (DHCP em vez de estático), `NEXT_PUBLIC_API_URL`
      fica desatualizado (é build-time) - confirmar que `10.17.200.7` é
      estático de verdade, senão vale documentar o rebuild como parte do
      processo de start.
