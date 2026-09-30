# Feedback

The **Feedback** button in the header opens a GitHub issue on this repo, prefilled with the
Feedback form: what kind of thing it is (bug, idea, question), what happened, and a context line
the app fills in for you: version, whether it runs from the home screen, viewport, active tool and
selection, device. You need a GitHub account; that is the identity on the issue.

Write it right when it happens, and say what you did and what you expected. The label `feedback`
starts a triage in GitHub Actions: an agent reads the issue and the code, gives it a proper title,
labels it `bug`, `enhancement` or `question`, and comments a diagnosis. If the change is small and
clear it adds `agent:ready`, and a coding agent picks it up and opens a pull request.

Nothing leaves the app on its own: the button only builds a link, GitHub does the rest.

## Pieces

- `src/feedback.js`: the button and the context line.
- `.github/ISSUE_TEMPLATE/feedback.yml`: the form.
- Triage: the `feedback` workflow from [JakobMelchard/.github](https://github.com/JakobMelchard/.github).
