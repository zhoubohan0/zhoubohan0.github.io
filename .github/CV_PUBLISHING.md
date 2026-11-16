# CV publishing

`cv/` is a private submodule. The public site exposes only
`/cv/cv_en_latest.pdf` and `/cv/cv_zh_latest.pdf`.

Edit and compile in the original `简历/cuhk` checkout, commit the updated PDFs,
and push `CV-ZBH/master`. Its **Sync published CV** workflow updates only this
repository's `cv` gitlink. That push triggers **Publish website**. Source-only
changes do not trigger publishing, and unchanged gitlinks do not create commits.

The website workflow reads the exact recorded CV commit using the read-only
`CV_SUBMODULE_DEPLOY_KEY` secret. `build_site.py` exports committed website files
into a separate directory and copies only the two allowed CV PDFs. Never upload
the entire checkout as a Pages artifact: it contains private CV source files.

GitHub Pages must use **GitHub Actions** as its publishing source. Failed builds
do not run the deployment job. Both workflows also support manual runs on master.

After an automatic update, refresh a local website checkout with:

```sh
git pull --ff-only
git submodule update --init --recursive
```

The separate `简历/cuhk` checkout remains independent. Website collaborators need
their own access to `CV-ZBH` to initialize its submodule locally; visitors need
no authentication to view the published PDFs.
