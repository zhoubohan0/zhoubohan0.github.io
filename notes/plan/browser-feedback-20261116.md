# Browser feedback implementation

Apply all user comments to v2 only; preserve v1 and the baseline media.

1. News: all 13 entries in a fixed-height, keyboard-scrollable panel; remove expand/collapse.
2. Education logos: no tile/frame/background/padding; height of three body lines. Experience logos: no tile/frame; height of organization + role first two text lines, preserving image aspect ratio.
3. Remove Skills and replace Location with the reference Visitor map. Keep Services text but reproduce reference Services cards/icons.
4. Highlight the six first-author/co-first-author works (roboaware, fetch, bidexhd, megohand, nolo, stg) in every filter; Selected membership stays independent.
5. Update navigation for the new sections, copy the supplied personal SVG to shared branding, use it in v2 navigation/favicon.
6. Move the CV row below left-side biography, with links at opposing ends. Append LinkedIn, Bilibili, Douyin, Hugging Face in the user-supplied order. Keep only X/Instagram/ModelScope commented.
7. Copy reference globe rendering/interaction and CSS. User explicitly chose disconnected statistics: no source-owner counts, seeded locations, manual additions or tracking endpoint.

Acceptance: updated content validator and meaningful browser checks at 1209x984 plus 1440/1024/768/390, light/dark, logo geometry, news scroll, first-author styling, cards, CV/social order, globe keyboard/drag/details. Rebuild the existing local preview URL after checks; no production push.

Additional user comments: move PKU GPA after Research without a separate hard break; remove the visible footer credit/old-version link; turn the three coauthor links into obvious external-link cards.

Further feedback: two TA bullets in course/term/instructor/background order, add Fundamental Computing with C++ (2026 Fall, Dr. Yat Chiu Law / Senior Lecturer, CUHK CSE, verified via official faculty page); remove Conference prefix, append specified reviewer venues; Qize first among coauthors; make all white-background organization logos transparent PNG derivatives while retaining originals.
