# Dune Awakening Schematic Tracker

A lightweight web app for tracking unique schematics in *Dune: Awakening*.  
Built with plain HTML/JS and deployed via GitHub Pages.

## Features

- Mark schematics as **Owned**
- Add personal **Notes** for each schematic
- Search across titles and notes
- Sort schematics by Title
- Hide/show owned schematics
- Download/Upload your data
- Works fully client-side, state saved in your browser

## Deployment

This site is automatically deployed to **GitHub Pages** using a GitHub Actions workflow.

[![Deploy to GitHub Pages](https://github.com/snarf-dev/dune_awakening_schematics_tracker/actions/workflows/deploy.yml/badge.svg)](https://github.com/snarf-dev/dune_awakening_schematics_tracker/actions/workflows/deploy.yml)

Live site: [https://snarf-dev.github.io/dune_awakening_schematics_tracker](https://snarf-dev.github.io/dune_awakening_schematics_tracker)

## Development

Clone and open `index.html` in a browser (or serve with any static web server):

```bash
git clone git@github.com:snarf-dev/dune_awakening_schematics_tracker.git
cd dune_awakening_schematics_tracker
```

Update `dune_unique_schematics.csv` to refresh the data.  
Commit and push to `main` — GitHub Actions will redeploy the site to Pages automatically.

## License

None - Feel free to do whatever you like with this code.