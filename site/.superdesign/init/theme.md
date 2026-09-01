# Theme

Source: `app/globals.css` (520 lines, global CSS without a component framework).

## Tokens

```css
:root {
  --milk: #fbf5e9;
  --cream: #f2e6d3;
  --paper: #fffaf1;
  --cocoa: #3b2118;
  --caramel: #a85f38;
  --berry: #b7484f;
  --ink: #654d42;
  --line: #ddcbb7;
}
```

Typography uses Georgia for display headings and Arial/Helvetica for UI and body copy. Public cards use warm paper surfaces, thin milk-brown borders, restrained cocoa shadows, and rounded asymmetrical CTA shapes. CRM should keep these exact colors while using denser, more utilitarian spacing: 14px body text, 10–11px uppercase labels, 14–18px radii, and a maximum content width around 1440px.

The full raw stylesheet remains the canonical source at `app/globals.css` and is passed directly to design generation because it is below the 900-line threshold.
