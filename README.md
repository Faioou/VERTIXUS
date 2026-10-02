# Código da Estrada PT

Aplicação preparada para dois modos:

## 1. Localhost — modo administrador

Requer Node.js instalado.

No terminal, dentro da pasta do projeto:

```bash
npm start
```

Depois abra:

```text
http://localhost:3000
```

Neste modo pode criar, editar e apagar perguntas.  
As alterações são gravadas diretamente em:

```text
data/perguntas.json
```

As imagens novas ficam em:

```text
imagens/
```

Depois publique as alterações:

```bash
git add .
git commit -m "Atualizar perguntas"
git push
```

## 2. GitHub Pages — modo público

No GitHub Pages a aplicação lê:

```text
data/perguntas.json
```

e mostra apenas as áreas de treino e banco de perguntas.

## GitHub Pages

Em GitHub:

1. Settings
2. Pages
3. Deploy from a branch
4. Branch: main
5. Pasta: / (root)
6. Save

Aguarde a publicação.

## Estrutura

```text
codigo-estrada-github/
├── index.html
├── app.js
├── style.css
├── server.js
├── package.json
├── data/
│   └── perguntas.json
└── imagens/
    ├── distancia-seguranca.png
    └── agente-regulador.png
```
