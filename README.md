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
















Claro. A partir do `eval`, use esta ordem:

```bash
eval "$(ssh-agent -s)"

ssh-add -D

ssh-add ~/.ssh/Faioou

ssh -T git@github.com

git config user.name "Faioou"

git config user.email "37d0.durje@gmail.com"

git add .

git commit -m "first commit"

git branch -M main

git remote add origin git@github.com:Faioou/codigo_estrada_expressoes_informais.git

git push -u origin main
```

Se o `git remote add origin ...` disser que o `origin` já existe, **não volte a adicioná-lo**. Nesse caso faça simplesmente:

```bash
git remote -v
git push -u origin main
```

E no seu caso concreto, como o `origin` **já foi criado**, pode fazer diretamente:

```bash
eval "$(ssh-agent -s)"
ssh-add -D
ssh-add ~/.ssh/Faioou
ssh -T git@github.com
git config user.name "Faioou"
git config user.email "37d0.durje@gmail.com"
git add .
git commit -m "first commit"
git branch -M main
git push -u origin main
```

Essa é a sequência certa para o ponto em que está agora.


Se quiser que **Faioou fique como chave ativa por defeito**, escreva uma vez:

```bash
git config --global core.sshCommand "ssh -i ~/.ssh/Faioou -o IdentitiesOnly=yes"
```

A partir daí, pode fechar o Git Bash, reiniciar o PC, voltar amanhã — o Git continuará a usar **Faioou**.

Para confirmar:

```bash
git config --global core.sshCommand
```

Deve devolver:

```text
ssh -i ~/.ssh/Faioou -o IdentitiesOnly=yes
```

Quando decidir mudar para **tomasnborges**, escreve apenas:

```bash
git config --global core.sshCommand "ssh -i ~/.ssh/tomasnborges -o IdentitiesOnly=yes"
```

E a partir desse momento fica `tomasnborges` permanentemente, até voltar a mudar.