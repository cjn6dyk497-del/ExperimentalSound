# Experimental Sound 🎧

Site de produtor musical, **estático**, hospedado no **GitHub Pages** com **deploy automático via GitHub Actions**.

- 🎵 Catálogo de faixas com **player fixo** (play/pause, anterior/próxima, barra de progresso, volume, playlist).
- ⬇️ **Download** das faixas que você liberar.
- 📨 Seção de **contato/contratação** (formulário via Formspree ou e‑mail).
- 🔗 **Redes sociais** e plataformas.
- ⬆️ **Painel de envio no navegador** (`admin.html`) com dois modos:
  - **Salvar no navegador** — guarda a faixa localmente (IndexedDB), toca na hora **só neste dispositivo**. Ótimo para testar.
  - **Publicar no site** — envia o áudio para o repositório pela **API do GitHub** e atualiza a lista; o push dispara o deploy e a faixa fica **pública para todos**.

> **Por que dois modos?** O GitHub Pages é hospedagem estática (sem servidor), então não há para onde "subir" um arquivo permanentemente a partir de um formulário comum. A publicação real é feita gravando o arquivo no próprio repositório via API do GitHub — sem precisar de backend externo.

---

## 🚀 Colocar no ar (uma vez)

1. **Faça merge desta branch na `main`** (o deploy roda em pushes para `main`).
2. No GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Aguarde o workflow **Deploy to GitHub Pages** terminar (aba **Actions**).
4. O site ficará em `https://SEU-USUARIO.github.io/SEU-REPO/`.

O deploy também pode ser disparado manualmente em **Actions → Deploy to GitHub Pages → Run workflow**.

---

## 🎚️ Adicionar músicas

### Opção A — pelo painel, publicando direto (recomendado)

1. Crie um **token fino (fine‑grained PAT)**: <https://github.com/settings/personal-access-tokens/new>
   - **Repository access:** apenas este repositório.
   - **Permissions → Repository → Contents:** **Read and write**.
2. Abra `admin.html` no site (link “Enviar música”).
3. Na seção **Publicação (GitHub)**, confira `owner`/`repositório`/`branch` (geralmente já vêm preenchidos), cole o **token** e clique em **Verificar acesso** → **Salvar**.
   - O token fica **somente no seu navegador** (localStorage); nunca é versionado.
4. Arraste o áudio, preencha título/gênero/capa e clique em **Publicar no site**.
5. Em ~1–2 min o GitHub Actions atualiza o site para todos.

### Opção B — manualmente pelo repositório

1. Coloque o arquivo em `audio/` (e a capa em `covers/`, opcional).
2. Adicione uma entrada em `data/tracks.json`:
   ```json
   {
     "tracks": [
       {
         "id": "minha-faixa-1",
         "title": "Minha Faixa",
         "artist": "Seu Nome",
         "genre": "House",
         "src": "audio/minha-faixa.mp3",
         "cover": "covers/minha-faixa.jpg",
         "duration": 184,
         "downloadable": true,
         "fileName": "minha-faixa.mp3"
       }
     ]
   }
   ```
3. Commit + push para `main`. O deploy é automático.

> 💡 Para a web, prefira **MP3 (≈320 kbps)**. WAVs longos deixam o repositório pesado e a API do GitHub tem limite por arquivo. Guarde os masters à parte.

---

## ⚙️ Personalizar

Edite **`data/site.json`**:

```json
{
  "brand": "SeuNomeArtístico",
  "tagline": "frase curta",
  "bio": "um parágrafo sobre você",
  "email": "seu@email.com",
  "formspreeId": "xxxxxxx",
  "socials": [
    { "label": "Instagram", "url": "https://instagram.com/voce", "icon": "instagram" }
  ]
}
```

- **Formulário de contato:** crie um formulário em [Formspree](https://formspree.io/), pegue o ID (`https://formspree.io/f/XXXXXXX` → `XXXXXXX`) e coloque em `formspreeId`. Sem isso, o botão abre o app de e‑mail com a mensagem pronta.
- **Ícones de redes** disponíveis: `instagram`, `soundcloud`, `spotify`, `youtube`, `bandcamp`, `tiktok`, `link`.
- **Cores/visual:** variáveis CSS no topo de `css/styles.css` (`--neon`, `--neon-2`, etc.).

---

## 🗂️ Estrutura

```
index.html          Site público
admin.html          Painel de envio
404.html
css/                styles.css (tema) + admin.css
js/                 app.js, admin.js, player.js, store.js, github.js, icons.js
data/site.json      Configuração do site (nome, bio, redes, contato)
data/tracks.json    Lista de faixas publicadas
audio/  covers/      Arquivos de áudio e capas
.github/workflows/  deploy.yml (GitHub Pages via Actions)
```

100% sem build: HTML/CSS/JS puro (ES modules). Nada de instalar dependências.
