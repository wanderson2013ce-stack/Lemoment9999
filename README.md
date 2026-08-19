# LeMoment — Backend

Cria convidados, gera um QR code único para cada um, envia esse QR
automaticamente pelo WhatsApp (via Z-API) e disponibiliza a página onde o
convidado cadastra seus acompanhantes.

## 1. Conectar o WhatsApp na Z-API

1. Crie uma conta em https://www.z-api.io
2. Crie uma "instância" — a Z-API vai mostrar um QR code
3. Escaneie esse QR code com o WhatsApp que a LeMoment vai usar para enviar
   os convites (Configurações → Aparelhos conectados → Conectar aparelho)
4. No painel da instância, copie: **Instance ID**, **Token** e **Client-Token**

Esse é um QR code diferente do QR do convidado — este é só para conectar o
número de WhatsApp da empresa à Z-API, uma vez.

## 2. Configurar o projeto

```bash
npm install
cp .env.example .env
```

Edite o `.env` e preencha `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN` e
`ZAPI_CLIENT_TOKEN` com os valores copiados no passo 1.

## 3. Testar localmente

```bash
npm start
```

Sem uma `BASE_URL` pública, a Z-API não consegue baixar a imagem do QR para
enviar — então para testar o envio de verdade, veja o passo 4 primeiro.
Sem WhatsApp configurado, o servidor ainda funciona normalmente (só pula o
envio e avisa no console), então dá pra testar a criação de convidados e a
página de acompanhantes localmente.

Teste criando um convidado:

```bash
curl -X POST http://localhost:3000/api/convidados \
  -H "Content-Type: application/json" \
  -d '{"nome":"Maria Silva","telefone":"31999998888"}'
```

## 4. Colocar no ar (hospedagem)

A Z-API precisa acessar a imagem do QR numa URL pública, e o convidado
precisa abrir o link do convite pelo celular — então o backend precisa estar
hospedado num domínio real, não só rodando no seu computador.

Opções simples para começar (planos gratuitos ou baratos):
- **Render** (render.com) — sobe direto de um repositório Git
- **Railway** (railway.app)

Depois do deploy, atualize `BASE_URL` no `.env` (ou nas variáveis de
ambiente do serviço escolhido) para a URL pública gerada, ex:
`https://lemoment-backend.onrender.com`.

## 5. Endpoints disponíveis

| Método | Rota | O que faz |
|---|---|---|
| POST | `/api/convidados` | Cria convidado, gera QR e envia pelo WhatsApp |
| GET | `/api/convidados` | Lista convidados + contadores (confirmados/presentes/ausentes) |
| GET | `/convite/:id` | Página do convidado para cadastrar acompanhantes |
| POST | `/api/convidados/:id/acompanhantes` | Salva os acompanhantes |
| POST | `/api/portaria/checkin` | Confirma entrada de um convidado (usado pelo app da portaria) |

## Sobre o banco de dados

Este backend usa um arquivo `db.json` como banco de dados — simples e
suficiente para o volume de um evento. Se a LeMoment crescer e passar a
gerenciar muitos eventos simultâneos, o próximo passo é trocar isso por um
banco de verdade (Postgres, por exemplo), mas a lógica dos endpoints não
muda.

## Importante sobre a Z-API

É um provedor não-oficial: ele conecta ao WhatsApp comum da empresa (como o
WhatsApp Web), não à API oficial da Meta. É rápido de configurar e mais
barato, mas carrega o risco de o número ser bloqueado pelo WhatsApp em caso
de uso identificado como automatizado/abusivo. Para o volume de uma empresa
de eventos (dezenas a poucas centenas de convites por evento, para pessoas
que de fato confirmaram presença) esse risco costuma ser baixo, mas vale
manter em mente.
