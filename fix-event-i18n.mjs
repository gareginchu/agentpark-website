import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('index.html', 'utf8');

// 1. Add missing Armenian translations for events-upcoming-label and events-past-label
// Also add ev-more and ev-spots keys
// Insert after 'events-h2' line in TRANS.am
content = content.replace(
  "'events-h2': '\u0531\u0580\u056A\u0561\u0564\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580 AgentPark-\u0578\u0582\u0574',",
  "'events-h2': '\u0531\u0580\u056A\u0561\u0564\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580 AgentPark-\u0578\u0582\u0574',\n" +
  "      'events-upcoming-label': '\u0531\u057C\u0561\u057B\u056B\u056F\u0561 \u0574\u056B\u057B\u0578\u0581\u0561\u057C\u0578\u0582\u0574\u0576\u0565\u0580',\n" +  // Առաջիկա միջdelays
  "      'events-past-label': '\u0531\u0576\u0581\u0575\u0561\u056C \u0574\u056B\u057B\u0578\u0581\u0561\u057C\u0578\u0582\u0574\u0576\u0565\u0580',"  // Անdelays միdelays
);

// 2. Add ev-more and ev-spots to TRANS.en (before ev-view-details)
content = content.replace(
  "'ev-view-details': 'View Details',",
  "'ev-more': 'more', 'ev-spots': 'spots',\n        'ev-view-details': 'View Details',"
);

// 3. Add ev-more and ev-spots to TRANS.am (before ev-view-details)
content = content.replace(
  "'ev-view-details': '\u0534\u056B\u057F\u0565\u056C \u0574\u0561\u0576\u0580\u0561\u0574\u0561\u057D\u0576\u0565\u0580\u0568',",
  "'ev-more': '\u0561\u057E\u0565\u056C\u056B\u0576', 'ev-spots': '\u057F\u0565\u0572',\n" +  // delays, delays
  "      'ev-view-details': '\u0534\u056B\u057F\u0565\u056C \u0574\u0561\u0576\u0580\u0561\u0574\u0561\u057D\u0576\u0565\u0580\u0568',"
);

// 4. Replace hardcoded "more" with translation key in buildCardHTML
content = content.replace(
  `class="text-gold font-medium hover:underline">more</a>`,
  `class="text-gold font-medium hover:underline">\${t['ev-more']}</a>`
);

// 5. Replace hardcoded "spots" with translation key
content = content.replace(
  '${ev.capacity} spots',
  "${ev.capacity} ${t['ev-spots']}"
);

// 6. Replace hardcoded en-US date locale with dynamic locale
content = content.replace(
  "new Date(ev.date).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})",
  "new Date(ev.date).toLocaleDateString(currentLang === 'am' ? 'hy-AM' : 'en-US',{month:'long',day:'numeric',year:'numeric'})"
);

writeFileSync('index.html', content, 'utf8');
console.log('Done! Fixed event i18n in index.html');
