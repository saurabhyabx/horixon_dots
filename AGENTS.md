<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting published git history — force pushing, or rebasing/amending/squashing commits that are already pushed — as it rewrites history on Lovable's side and the user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Keep capture immediate in React. Per the approved desk-storage design, each connected desk owns a local folder with desk.json and assets/. Browser storage is a fallback copy, not a folder or a backup. Preserve legacy browser data; never claim a failed write succeeded. No server persistence or version history.
- Keep the single-screen experience on `/`; filters, views, capture, and detail are interactions within the same workspace.
- For repository maps, code index (line-level symbols), stylesheet reference, data/control flow diagrams, and maintenance guidelines, consult [appendix.md](appendix.md).
