# KyivMetroGo — GitHub Pages ready

This package is prepared to be published on GitHub Pages. To deploy:

1. Create a new GitHub repository (e.g. `KyivMetroGo`).
2. Commit & push files to `main` branch:
```
git init
git add .
git commit -m "Initial PWA"
git branch -M main
git remote add origin https://github.com/YOURNAME/YOURREPO.git
git push -u origin main
```
3. In GitHub repository settings -> Pages, set Source to `main` branch `/ (root)` and save.
4. Visit `https://YOURNAME.github.io/YOURREPO/` and open on mobile Chrome -> Add to Home screen.

Notes: service-worker requires HTTPS or localhost. GitHub Pages provides HTTPS.
