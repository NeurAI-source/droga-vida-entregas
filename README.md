# Droga Vida Entregas

Subsite de logística da Droga Vida Popular para entregadores e administradores.

## O que já está pronto

- Login usando o mesmo Supabase da Droga Vida
- `owner`/`admin` do `team_members` entram na Central Administrativa
- Entregadores ficam em `delivery_drivers`
- Tela mobile do entregador
- Central administrativa com mapa operacional
- Localização ao vivo do entregador usando geolocalização do aparelho
- Atualização do mapa administrativo via Supabase Realtime
- Tabelas e RLS do núcleo de entregas aplicadas no Supabase existente
- Base para entregas por foto, cadastro manual e pedidos integrados
- PWA instalável no celular

## Desenvolvimento

```bash
npm run dev
```

## Build

```bash
npm run build
```

As variáveis `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` podem sobrescrever a configuração pública padrão durante o build.

## Próximas fases

1. Cadastro e administração de entregadores.
2. Cadastro manual de entrega.
3. Leitura de comandas por foto/OCR.
4. Geocodificação dos endereços.
5. Otimização automática da ordem das paradas.
6. Trânsito, recálculo de rota e ETA.
7. Comprovante de entrega com foto em bucket privado.
