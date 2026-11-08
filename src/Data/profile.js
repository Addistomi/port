// Everything on the profile panel comes from this file. Edit the text here.
// NOTE: these details are placeholders. Replace them with your real CV.
export const profile = {
  name: "Natnael Diribsa",
  title: "Freelance video editor and colourist",
  location: "Addis Ababa, Ethiopia",
  availability: "Booking from November",
  photo: "profile.webp", // put your picture at public/profile.jpg
  cvUrl: "cv.pdf", // for a Download CV button: put your file at public/cv.pdf and set this to "/cv.pdf"
  email: "Natnaeldiribsa77@gmail.com",

  about: [
    "I'm a freelance video editor who turns raw footage into films people finish watching. For the past three years I have cut documentaries, music videos and brand films for independent producers, agencies and artists.",
    "I start with the story, then tune the pace, the picture and the sound until every cut earns its place. I work fast, communicate clearly and deliver exactly to spec.",
  ],

  stats: [
    ["3+", "Years editing"],
    ["100+", "Projects delivered"],
    ["4+", "Companies"],
    ["24h", "Reply time"],
  ],

 experience: [
  {
    role: "Filmmaker and Video Editor",
    org: "Riseup Podcast",
    when: "April 10, 2025 to july 15 2025", // Replace with your dates, e.g., "2025 to Present" or specific months
    points: [
      "Filmed and edited video podcast episodes, managing end-to-end production.",
      "Maintained high production standards with smooth cuts, clear pacing, and engaging storytelling.",
    ],
  },
  {
    role: "Video Editor",
    org: "Fanos Crypto",
    when: "3 years, 2022 to 2025",
    points: [
      "Edited video content for a crypto media brand in Adobe Premiere Pro.",
      "Kept to regular publishing deadlines with a consistent pace and story flow.",
    ],
  },
  {
    role: "Cameraman and Video Editor",
    org: "Manyazewal Eshetu",
    when: "May 5 - September 2 2022",
    points: [
      "Filmed and edited personal branding content, from shoot to final cut.",
      "Handled the full production process on my own, in Premiere Pro.",
    ],
  },
  {
    role: "Video Editor",
    org: "Melhk Marriage Consoling",
    when: "April 15 - May 16 2026",
    points: [
      "Contributed editing work for an organizational content project.",
      "Cut video with a focus on pacing and clear storytelling.",
    ],
  },
],
  

  skills: [
    { group: "Editing", items: ["Premiere Pro", "DaVinci Resolve"] },
    { group: "Colour and sound", items: ["DaVinci Resolve colour", "Audition"] },
    { group: "Motion and delivery", items: ["After Effects", "Captions and subtitles", "Social cutdowns", "Proxy workflows"] },
  ],

  education: [{ title: "BA Film and Media", where: "University of Lisbon", when: "2012 to 2016" }],

  languages: ["English", "Amharic", "Afaan Oromo"],
};