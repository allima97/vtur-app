# Repositorios GitHub do vtur

O produto chama-se `vtur`.

Separacao recomendada de repositorios:

- `vtur`: app em `vtur.app`
- `vtur-site`: institucional em `vtur.com.br`

Este ambiente nao possui `gh` instalado nem token GitHub configurado, entao a criacao remota precisa ser feita manualmente.

## Comandos sugeridos

App atual:

```bash
cd /Users/allima97/Documents/GitHub/vtur-app
git remote remove origin
git remote add origin https://github.com/allima97/vtur.git
git push -u origin main
```

Site institucional:

```bash
cd /Users/allima97/Documents/GitHub/vtur-site
git remote add origin https://github.com/allima97/vtur-site.git
git add .
git commit -m "chore: inicia repositorio institucional do vtur"
git push -u origin main
```
