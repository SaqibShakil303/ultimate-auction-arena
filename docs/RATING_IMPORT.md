# Manual rating and portrait import

Open Football Arena → Mode/Players/Rules → Cards. Select a rating mode, then **Manage, edit & import cards**. Download the CSV template, import a file or paste JSON/CSV. Review the eligible pool count before starting.

The custom library supports 300 cards per arena. Import a curated auction pool. Reimporting the same name and rating mode updates that record and clears its prior local rating edit. Export JSON before resetting the library. Built-in tables are not mutated.

## Verification rules

Official records need a name, valid primary position, nationality, club, integer OVR and all six integer attributes in 1–99. They also need the rating mode, an HTTPS `ea.com` source, a valid calendar date and `verificationStatus: verified`. Lookalike hostnames do not qualify. Missing numbers display **—**, remain unverified and cannot enter official auctions. Editing a verified rating invalidates its verification.

The app does not fetch the source page or authenticate its numbers. The host must check identity, edition, attributes, positions, PlayStyles and permitted use. A source URL alone is not proof; the UI therefore says **Host verified**. No data-use or image license is granted by importing a file.

FC 26 and FC 27 stay separate. Prime Legends uses custom values; a verified Icon/Hero in Prime mode must also include its original `edition` (`FC 26` or `FC 27`). That edition stays on the card. The same documented game scoring normalization applies to the chosen mode, including sourced items explicitly imported into Prime.

## JSON template

This template contains no verified ratings. Replace placeholders and nulls before marking verified.

```json
[
  {
    "name": "Verified full player name",
    "ratingMode": "fc27",
    "edition": "FC 27",
    "cardType": "standard",
    "overall": null,
    "stats": [null, null, null, null, null, null],
    "pos": "CM",
    "alt": [],
    "nation": "Verified nationality",
    "club": "Verified club for this edition",
    "playStyles": [],
    "source": "https://www.ea.com/games/ea-sports-fc/ratings",
    "verifiedAt": null,
    "verificationStatus": "unverified"
  }
]
```

Outfield stats: PAC, SHO, PAS, DRI, DEF, PHY. Goalkeeper stats: DIV, HAN, KIC, REF, SPD, POS. In CSV use **positioning** for the last keeper attribute, since **pos** identifies the playing position. Separate lists with `|` or `;`; quote fields containing commas. UTF-8 names, quoted commas, escaped quotes and newlines are supported.

CSV aliases include OVR/overall, pos/position, nationality/nation, secondary_positions/alt, source_url/source and date_verified/verifiedAt. Card types: standard, icon, hero, special, custom. Use an `edition` column for a sourced Icon/Hero in Prime mode.

## Portrait metadata

For an image you are permitted to use, add `image` and `imageMeta`:

```json
{
  "image": "https://your-authorized-host.example/portrait.jpg",
  "imageMeta": {
    "source": "Photographer or authorized provider",
    "sourceUrl": "https://your-authorized-host.example/license-page",
    "license": "Exact applicable license",
    "attribution": "Required credit text",
    "verifiedAt": "2026-11-15",
    "verified": false
  }
}
```

Only mark image metadata verified after checking identity, rights and credit. The application does not independently audit these claims. CSV equivalents: image_url, image_source, image_source_url, image_license, image_attribution, image_verified_at, image_verified. Remote caching follows the provider's headers; images are not downloaded into the repository. Share cards use original graphics and text, avoiding imported portrait redistribution.

## Sources checked for V2

- [EA's official ratings page](https://www.ea.com/games/ea-sports-fc/ratings) displayed FC 27 on 2026-11-15. Its scope is launch Gold/Silver/Bronze base items; it excludes Icons, Heroes and campaign items. It is not an FC 26 historical snapshot.
- [EA's FC Community API update](https://www.ea.com/games/ea-sports-fc/news/pitch-notes-fc26-community-api-update) describes approved partner access to account data. This project has no such integration or authorization.

No licensed bulk export or authenticated FC 26 archive was supplied. The import workflow is implemented; full official dataset population still depends on permitted data. No mass scraping or protected portrait hotlinking was performed.
