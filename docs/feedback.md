# Feedback

On the tailnet the header shows a **Feedback** button by itself: the app pings the relay on the
home server, a name only tailnet devices can reach, and Tailscale tells the relay who you are. No
link, no token, nothing to paste. People with a feedback link get the same button anywhere else.
Everyone else sees nothing and nothing is sent.

## The link (outside the tailnet)

A feedback link is the app URL with a token in the fragment:

```
https://docs.melchard.org/flatplan/app/#fb=…
```

On first open the app stores the token on that device and removes it from the address bar. The
fragment never reaches a server. An app installed on the home screen has its own storage, so it
cannot pick the token up from a link opened in Safari: paste it once into the **Feedback token**
field at the bottom of the `?` help dialog instead. The token names the sender (it maps to a name on the receiving
side), so one link per person; rotating the token on the receiver revokes that link.

## What is sent

The form asks for a category (bug, idea, question), the message and an optional name. Along with
it goes what a bug report usually lacks: the running version, device and screen size, whether the
app runs from the home screen, the active tool and selection, and the last 50 pointer events with
the tool and drag state at the time.

From the tailnet it goes to the relay on the home server, which stamps the sender from the
Tailscale identity headers and forwards it; otherwise straight to switchboard (the automation hub
on Cloudflare) with the link token. Either way switchboard files a GitHub issue on this repo as a
GitHub App, with the user text fenced as untrusted input. An agent on the home server then
triages it: a proper title, a `bug`, `enhancement` or `question` label, a summary comment, and
`agent:ready` when the change is small and clear enough for a coding agent to pick up.

## Pieces

- `src/feedback.js`: pings the relay or reads the token, collects context, loads the shim, adds the button.
- `observe.js`: the browser shim, vendored from
  [JakobMelchard/observe](https://github.com/JakobMelchard/observe) (`src/observe/shim/observe.js`);
  never edit, copy a newer version and note its commit in the header.
- Relay: [JakobMelchard/monitor](https://github.com/JakobMelchard/monitor) `modules/feedback`. Receiver and
  triage: [JakobMelchard/switchboard](https://github.com/JakobMelchard/switchboard),
  README section Feedback.
