/*
 * ScholarScroll configuration and initial state
 * ---------------------------------------------
 * The live catalog is intentionally absent from this file. Catalog metadata
 * comes from Gutendex at runtime; only user identities, local demo state and
 * the small offline seed snapshots live here.
 *
 * Demo note: passwords are represented by SHA-256 hashes and the demo
 * credentials are intentionally public. This is a static, browser-only
 * demonstration, not a production authentication boundary.
 */
(() => {
  "use strict";

  const DAY_IN_MS = 24 * 60 * 60 * 1000;
  const isoFromNow = (days) => new Date(Date.now() + (days * DAY_IN_MS)).toISOString();
  const dayKey = (value = new Date()) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const dayFromNow = (days) => dayKey(new Date(Date.now() + (days * DAY_IN_MS)));

  /* Minimal snapshots let the dashboard and saved shelf work when Gutendex is
     unreachable. The reader can still fetch the real text when online. */
  const seedBooks = {
    "gutenberg-1342": {
      key: "gutenberg-1342",
      id: 1342,
      source: "gutendex",
      title: "Pride and Prejudice",
      author: "Jane Austen",
      authors: ["Jane Austen"],
      category: "Romance",
      subjects: ["Courtship -- Fiction", "England -- Fiction"],
      languages: ["en"],
      summary: "Elizabeth Bennet and Mr. Darcy navigate pride, prejudice and the expectations of Regency society in Jane Austen's most celebrated novel.",
      coverUrl: "https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg",
      sourceUrl: "https://www.gutenberg.org/ebooks/1342",
      downloadCount: 0,
      copyright: false,
      reader: {
        engine: "text",
        sourceUrl: "https://www.gutenberg.org/cache/epub/1342/pg1342.txt",
        mimeType: "text/plain; charset=utf-8"
      }
    },
    "gutenberg-84": {
      key: "gutenberg-84",
      id: 84,
      source: "gutendex",
      title: "Frankenstein; Or, The Modern Prometheus",
      author: "Mary Wollstonecraft Shelley",
      authors: ["Mary Wollstonecraft Shelley"],
      category: "Science fiction",
      subjects: ["Frankenstein's monster (Fictitious character) -- Fiction"],
      languages: ["en"],
      summary: "Victor Frankenstein creates life from death, then abandons the creature whose loneliness turns into a demand for revenge.",
      coverUrl: "https://www.gutenberg.org/cache/epub/84/pg84.cover.medium.jpg",
      sourceUrl: "https://www.gutenberg.org/ebooks/84",
      downloadCount: 0,
      copyright: false,
      reader: {
        engine: "text",
        sourceUrl: "https://www.gutenberg.org/cache/epub/84/pg84.txt",
        mimeType: "text/plain; charset=utf-8"
      }
    },
    "gutenberg-35": {
      key: "gutenberg-35",
      id: 35,
      source: "gutendex",
      title: "The Time Machine",
      author: "H. G. Wells",
      authors: ["H. G. Wells"],
      category: "Science fiction",
      subjects: ["Time travel -- Fiction"],
      languages: ["en"],
      summary: "A Victorian inventor travels to the distant future and discovers a world divided between the Eloi and the Morlocks.",
      coverUrl: "https://www.gutenberg.org/cache/epub/35/pg35.cover.medium.jpg",
      sourceUrl: "https://www.gutenberg.org/ebooks/35",
      downloadCount: 0,
      copyright: false,
      reader: {
        engine: "text",
        sourceUrl: "https://www.gutenberg.org/cache/epub/35/pg35.txt",
        mimeType: "text/plain; charset=utf-8"
      }
    }
  };

  /* Curated premium shelf. These are ordinary public-domain Project Gutenberg
     texts, presented as a members' collection. Every signed-in member can read
     any of them, free. A paid tier may be added in a future build. */
  const premiumBooks = [
    {
      key: "premium-meditations",
      id: 2680,
      source: "gutendex",
      premium: true,
      title: "Meditations",
      author: "Marcus Aurelius",
      authors: ["Marcus Aurelius"],
      category: "Philosophy",
      subjects: ["Stoicism", "Ethics"],
      languages: ["en"],
      summary: "The private notebook of a Roman emperor: practical reflections on duty, mortality and keeping a calm mind.",
      coverUrl: "https://www.gutenberg.org/cache/epub/2680/pg2680.cover.medium.jpg",
      sourceUrl: "https://www.gutenberg.org/ebooks/2680",
      downloadCount: 0,
      copyright: false,
      reader: {
        engine: "text",
        sourceUrl: "https://www.gutenberg.org/cache/epub/2680/pg2680.txt",
        mimeType: "text/plain; charset=utf-8"
      }
    },
    {
      key: "premium-art-of-war",
      id: 132,
      source: "gutendex",
      premium: true,
      title: "The Art of War",
      author: "Sun Tzu",
      authors: ["Sun Tzu"],
      category: "Strategy",
      subjects: ["Military art and science", "Strategy"],
      languages: ["en"],
      summary: "The classic treatise on strategy, preparation and winning without unnecessary conflict.",
      coverUrl: "https://www.gutenberg.org/cache/epub/132/pg132.cover.medium.jpg",
      sourceUrl: "https://www.gutenberg.org/ebooks/132",
      downloadCount: 0,
      copyright: false,
      reader: {
        engine: "text",
        sourceUrl: "https://www.gutenberg.org/cache/epub/132/pg132.txt",
        mimeType: "text/plain; charset=utf-8"
      }
    },
    {
      key: "premium-walden",
      id: 205,
      source: "gutendex",
      premium: true,
      title: "Walden",
      author: "Henry David Thoreau",
      authors: ["Henry David Thoreau"],
      category: "Nature",
      subjects: ["Solitude", "Nature", "Simplicity"],
      languages: ["en"],
      summary: "Two years beside a Massachusetts pond, and a quiet argument for living deliberately.",
      coverUrl: "https://www.gutenberg.org/cache/epub/205/pg205.cover.medium.jpg",
      sourceUrl: "https://www.gutenberg.org/ebooks/205",
      downloadCount: 0,
      copyright: false,
      reader: {
        engine: "text",
        sourceUrl: "https://www.gutenberg.org/cache/epub/205/pg205.txt",
        mimeType: "text/plain; charset=utf-8"
      }
    },
    {
      key: "premium-dorian-gray",
      id: 174,
      source: "gutendex",
      premium: true,
      title: "The Picture of Dorian Gray",
      author: "Oscar Wilde",
      authors: ["Oscar Wilde"],
      category: "Gothic",
      subjects: ["Portraits", "Conduct of life"],
      languages: ["en"],
      summary: "A beautiful portrait ages while its subject does not, in Wilde's sharp study of vanity and consequence.",
      coverUrl: "https://www.gutenberg.org/cache/epub/174/pg174.cover.medium.jpg",
      sourceUrl: "https://www.gutenberg.org/ebooks/174",
      downloadCount: 0,
      copyright: false,
      reader: {
        engine: "text",
        sourceUrl: "https://www.gutenberg.org/cache/epub/174/pg174.txt",
        mimeType: "text/plain; charset=utf-8"
      }
    },
    {
      key: "premium-dracula",
      id: 345,
      source: "gutendex",
      premium: true,
      title: "Dracula",
      author: "Bram Stoker",
      authors: ["Bram Stoker"],
      category: "Gothic",
      subjects: ["Vampires", "Transylvania (Romania)"],
      languages: ["en"],
      summary: "Letters, diaries and newspaper clippings assemble the hunt for a predator who has come to England.",
      coverUrl: "https://www.gutenberg.org/cache/epub/345/pg345.cover.medium.jpg",
      sourceUrl: "https://www.gutenberg.org/ebooks/345",
      downloadCount: 0,
      copyright: false,
      reader: {
        engine: "text",
        sourceUrl: "https://www.gutenberg.org/cache/epub/345/pg345.txt",
        mimeType: "text/plain; charset=utf-8"
      }
    },
    {
      key: "premium-the-prophet",
      id: 58585,
      source: "gutendex",
      premium: true,
      title: "The Prophet",
      author: "Kahlil Gibran",
      authors: ["Kahlil Gibran"],
      category: "Poetry",
      subjects: ["Prose poems", "Wisdom"],
      languages: ["en"],
      summary: "Twenty-six poetic essays on love, work, freedom and grief, spoken by a prophet before he departs.",
      coverUrl: "https://www.gutenberg.org/cache/epub/58585/pg58585.cover.medium.jpg",
      sourceUrl: "https://www.gutenberg.org/ebooks/58585",
      downloadCount: 0,
      copyright: false,
      reader: {
        engine: "text",
        sourceUrl: "https://www.gutenberg.org/cache/epub/58585/pg58585.txt",
        mimeType: "text/plain; charset=utf-8"
      }
    },
    {
      key: "premium-zarathustra",
      id: 1998,
      source: "gutendex",
      premium: true,
      title: "Thus Spoke Zarathustra",
      author: "Friedrich Nietzsche",
      authors: ["Friedrich Nietzsche"],
      category: "Philosophy",
      subjects: ["Superman", "Philosophy"],
      languages: ["en"],
      summary: "A prophet descends from the mountains with a challenging, lyrical call to create one's own values.",
      coverUrl: "https://www.gutenberg.org/cache/epub/1998/pg1998.cover.medium.jpg",
      sourceUrl: "https://www.gutenberg.org/ebooks/1998",
      downloadCount: 0,
      copyright: false,
      reader: {
        engine: "text",
        sourceUrl: "https://www.gutenberg.org/cache/epub/1998/pg1998.txt",
        mimeType: "text/plain; charset=utf-8"
      }
    },
    {
      key: "premium-great-gatsby",
      id: 64317,
      source: "gutendex",
      premium: true,
      title: "The Great Gatsby",
      author: "F. Scott Fitzgerald",
      authors: ["F. Scott Fitzgerald"],
      category: "Classics",
      subjects: ["American dream", "Long Island (N.Y.)"],
      languages: ["en"],
      summary: "A mysterious millionaire throws lavish parties in pursuit of a past he cannot repeat.",
      coverUrl: "https://www.gutenberg.org/cache/epub/64317/pg64317.cover.medium.jpg",
      sourceUrl: "https://www.gutenberg.org/ebooks/64317",
      downloadCount: 0,
      copyright: false,
      reader: {
        engine: "text",
        sourceUrl: "https://www.gutenberg.org/cache/epub/64317/pg64317.txt",
        mimeType: "text/plain; charset=utf-8"
      }
    },
    {
      key: "premium-reader-subconscious",
      id: "premium-reader-subconscious",
      source: "bundled",
      premium: true,
      collection: "Reader editions",
      title: "The Power of Your Subconscious Mind",
      author: "Joseph Murphy",
      authors: ["Joseph Murphy"],
      category: "Mindset",
      subjects: ["Subconscious mind", "Self-realization"],
      languages: ["en"],
      summary: "A practical exploration of how subconscious beliefs shape health, relationships and achievement.",
      coverUrl: "https://covers.openlibrary.org/b/id/6553019-L.jpg",
      sourceUrl: "https://openlibrary.org/search?q=The%20Power%20of%20Your%20Subconscious%20Mind%20Joseph%20Murphy",
      downloadCount: 0,
      copyright: true,
      rights: "User-supplied PDF",
      reader: {
        engine: "pdf",
        sourceUrl: "assets/premium/the-power-of-your-subconscious-mind.pdf",
        mimeType: "application/pdf"
      }
    },
    {
      key: "premium-reader-4-hour-workweek",
      id: "premium-reader-4-hour-workweek",
      source: "bundled",
      premium: true,
      collection: "Reader editions",
      title: "The 4-Hour Workweek",
      author: "Timothy Ferriss",
      authors: ["Timothy Ferriss"],
      category: "Productivity",
      subjects: ["Time management", "Lifestyle design"],
      languages: ["en"],
      summary: "A productivity playbook about escaping the office, automating work and designing a deliberate lifestyle.",
      coverUrl: "https://covers.openlibrary.org/b/id/539652-L.jpg",
      sourceUrl: "https://openlibrary.org/search?q=The%204-Hour%20Workweek%20Timothy%20Ferriss",
      downloadCount: 0,
      copyright: true,
      rights: "User-supplied PDF",
      reader: {
        engine: "pdf",
        sourceUrl: "assets/premium/the-4-hour-workweek.pdf",
        mimeType: "application/pdf"
      }
    },
    {
      key: "premium-reader-almanack-naval",
      id: "premium-reader-almanack-naval",
      source: "bundled",
      premium: true,
      collection: "Reader editions",
      title: "The Almanack of Naval Ravikant",
      author: "Eric Jorgenson",
      authors: ["Eric Jorgenson"],
      category: "Wealth & happiness",
      subjects: ["Wealth", "Happiness", "Decision making"],
      languages: ["en"],
      summary: "A curated collection of Naval Ravikant's ideas on building wealth, judgement and a calmer life.",
      coverUrl: "https://covers.openlibrary.org/b/id/10449931-L.jpg",
      sourceUrl: "https://openlibrary.org/search?q=The%20Almanack%20of%20Naval%20Ravikant%20Eric%20Jorgenson",
      downloadCount: 0,
      copyright: true,
      rights: "User-supplied PDF",
      reader: {
        engine: "pdf",
        sourceUrl: "assets/premium/the-almanack-of-naval-ravikant.pdf",
        mimeType: "application/pdf"
      }
    },
    {
      key: "premium-reader-wealth-emerson",
      id: "premium-reader-wealth-emerson",
      source: "bundled",
      premium: true,
      collection: "Reader editions",
      title: "Wealth",
      author: "Ralph Waldo Emerson",
      authors: ["Ralph Waldo Emerson"],
      category: "Essays",
      subjects: ["Conduct of life", "Wealth", "Self-reliance"],
      languages: ["en"],
      summary: "Emerson's 1860 essay on work, money and the conduct of life, taken from The Conduct of Life.",
      coverUrl: "https://covers.openlibrary.org/b/id/1852327-L.jpg",
      sourceUrl: "https://openlibrary.org/search?q=The%20Conduct%20of%20Life%20Ralph%20Waldo%20Emerson",
      downloadCount: 0,
      copyright: false,
      rights: "Public domain · user-supplied PDF",
      reader: {
        engine: "pdf",
        sourceUrl: "assets/premium/wealth-emerson.pdf",
        mimeType: "application/pdf"
      }
    },
    {
      key: "premium-reader-game-of-life",
      id: "premium-reader-game-of-life",
      source: "bundled",
      premium: true,
      collection: "Reader editions",
      title: "The Game of Life and How to Play It",
      author: "Florence Scovel Shinn",
      authors: ["Florence Scovel Shinn"],
      category: "Mindset",
      subjects: ["New Thought", "Success", "Self-help"],
      languages: ["en"],
      summary: "A 1925 classic about thought, faith and the everyday practice of shaping a fulfilling life.",
      coverUrl: "https://covers.openlibrary.org/b/id/406958-L.jpg",
      sourceUrl: "https://openlibrary.org/search?q=The%20Game%20of%20Life%20and%20How%20to%20Play%20It%20Florence%20Scovel%20Shinn",
      downloadCount: 0,
      copyright: false,
      rights: "Public domain · user-supplied PDF",
      reader: {
        engine: "pdf",
        sourceUrl: "assets/premium/the-game-of-life-and-how-to-play-it.pdf",
        mimeType: "application/pdf"
      }
    },
    {
      key: "premium-reader-think-and-grow-rich",
      id: "premium-reader-think-and-grow-rich",
      source: "bundled",
      premium: true,
      collection: "Reader editions",
      title: "Think and Grow Rich",
      author: "Napoleon Hill",
      authors: ["Napoleon Hill"],
      category: "Success",
      subjects: ["Success", "Wealth", "Personal development"],
      languages: ["en"],
      summary: "A classic success manual built around desire, persistence and a definite plan.",
      coverUrl: "https://covers.openlibrary.org/b/id/14542536-L.jpg",
      sourceUrl: "https://openlibrary.org/search?q=Think%20and%20Grow%20Rich%20Napoleon%20Hill",
      downloadCount: 0,
      copyright: false,
      rights: "User-supplied PDF",
      reader: {
        engine: "pdf",
        sourceUrl: "assets/premium/think-and-grow-rich.pdf",
        mimeType: "application/pdf"
      }
    },
    {
      key: "premium-reader-atomic-habits",
      id: "premium-reader-atomic-habits",
      source: "bundled",
      premium: true,
      collection: "Reader editions",
      title: "Atomic Habits",
      author: "James Clear",
      authors: ["James Clear"],
      category: "Habits",
      subjects: ["Habit formation", "Behaviour change", "Productivity"],
      languages: ["en"],
      summary: "A practical framework for building small habits that compound into meaningful change.",
      coverUrl: "https://covers.openlibrary.org/b/id/12539702-L.jpg",
      sourceUrl: "https://openlibrary.org/search?q=Atomic%20Habits%20James%20Clear",
      downloadCount: 0,
      copyright: true,
      rights: "User-supplied PDF",
      reader: {
        engine: "pdf",
        sourceUrl: "assets/premium/atomic-habits.pdf",
        mimeType: "application/pdf"
      }
    },
    {
      key: "premium-reader-richest-man-babylon",
      id: "premium-reader-richest-man-babylon",
      source: "bundled",
      premium: true,
      collection: "Reader editions",
      title: "The Richest Man in Babylon",
      author: "George S. Clason",
      authors: ["George S. Clason"],
      category: "Personal finance",
      subjects: ["Finance, Personal", "Saving and investment", "Parables"],
      languages: ["en"],
      summary: "Ancient-Babylonian parables about paying yourself first, living below your means and making money work for you.",
      coverUrl: "https://covers.openlibrary.org/b/id/10491331-L.jpg",
      sourceUrl: "https://openlibrary.org/search?q=The%20Richest%20Man%20in%20Babylon%20George%20S.%20Clason",
      downloadCount: 0,
      copyright: false,
      rights: "Public domain · user-supplied PDF",
      reader: {
        engine: "pdf",
        sourceUrl: "assets/premium/the-richest-man-in-babylon.pdf",
        mimeType: "application/pdf"
      }
    },
    {
      key: "premium-reader-science-getting-rich",
      id: "premium-reader-science-getting-rich",
      source: "bundled",
      premium: true,
      collection: "Reader editions",
      title: "The Science of Getting Rich",
      author: "Wallace D. Wattles",
      authors: ["Wallace D. Wattles"],
      category: "Success",
      subjects: ["Success", "Wealth", "New Thought"],
      languages: ["en"],
      summary: "Wattles' 1910 treatise on creative thought, gratitude and purposeful action as the basis of prosperity.",
      coverUrl: "https://covers.openlibrary.org/b/id/854989-L.jpg",
      sourceUrl: "https://openlibrary.org/search?q=The%20Science%20of%20Getting%20Rich%20Wallace%20D.%20Wattles",
      downloadCount: 0,
      copyright: false,
      rights: "Public domain · user-supplied PDF",
      reader: {
        engine: "pdf",
        sourceUrl: "assets/premium/the-science-of-getting-rich.pdf",
        mimeType: "application/pdf"
      }
    },
    {
      key: "premium-reader-art-of-money-getting",
      id: "premium-reader-art-of-money-getting",
      source: "bundled",
      premium: true,
      collection: "Reader editions",
      title: "The Art of Money Getting",
      author: "P. T. Barnum",
      authors: ["P. T. Barnum"],
      category: "Personal finance",
      subjects: ["Money", "Success", "Conduct of life"],
      languages: ["en"],
      summary: "The showman's 1880 lecture on golden rules for earning, keeping and spending money wisely.",
      coverUrl: "https://covers.openlibrary.org/b/id/756095-L.jpg",
      sourceUrl: "https://openlibrary.org/search?q=The%20Art%20of%20Money%20Getting%20P.%20T.%20Barnum",
      downloadCount: 0,
      copyright: false,
      rights: "Public domain · user-supplied PDF",
      reader: {
        engine: "pdf",
        sourceUrl: "assets/premium/the-art-of-money-getting.pdf",
        mimeType: "application/pdf"
      }
    },
    {
      key: "premium-reader-as-a-man-thinketh",
      id: "premium-reader-as-a-man-thinketh",
      source: "bundled",
      premium: true,
      collection: "Reader editions",
      title: "As a Man Thinketh",
      author: "James Allen",
      authors: ["James Allen"],
      category: "Mindset",
      subjects: ["Thought and thinking", "Self-culture", "Character"],
      languages: ["en"],
      summary: "A short 1902 essay on how thought shapes character, circumstance and achievement.",
      coverUrl: "https://covers.openlibrary.org/b/id/6268048-L.jpg",
      sourceUrl: "https://openlibrary.org/search?q=As%20a%20Man%20Thinketh%20James%20Allen",
      downloadCount: 0,
      copyright: false,
      rights: "Public domain · user-supplied PDF",
      reader: {
        engine: "pdf",
        sourceUrl: "assets/premium/as-a-man-thinketh.pdf",
        mimeType: "application/pdf"
      }
    },
    {
      key: "premium-reader-acres-of-diamonds",
      id: "premium-reader-acres-of-diamonds",
      source: "bundled",
      premium: true,
      collection: "Reader editions",
      title: "Acres of Diamonds",
      author: "Russell H. Conwell",
      authors: ["Russell H. Conwell"],
      category: "Success",
      subjects: ["Success", "Opportunity", "Self-help"],
      languages: ["en"],
      summary: "Conwell's celebrated lecture on finding opportunity close to home instead of searching elsewhere.",
      coverUrl: "https://covers.openlibrary.org/b/id/5833160-L.jpg",
      sourceUrl: "https://openlibrary.org/search?q=Acres%20of%20Diamonds%20Russell%20H.%20Conwell",
      downloadCount: 0,
      copyright: false,
      rights: "Public domain · user-supplied PDF",
      reader: {
        engine: "pdf",
        sourceUrl: "assets/premium/acres-of-diamonds.pdf",
        mimeType: "application/pdf"
      }
    }
  ];

  /* Modern bestsellers requested for the premium shelf. These titles are still
     in copyright and no reader copy has been supplied, so they are shown as a
     rights-aware preview only. No full text is bundled or fetched. */
  const premiumSpotlight = [
    {
      key: "spotlight-rich-dad-poor-dad",
      title: "Rich Dad Poor Dad",
      subtitle: "What the Rich Teach Their Kids About Money",
      author: "Robert T. Kiyosaki",
      category: "Personal finance",
      summary: "A memoir-style introduction to financial literacy, assets and the money habits taught at home.",
      coverUrl: "https://covers.openlibrary.org/b/id/8315603-L.jpg",
      sourceUrl: "https://openlibrary.org/search?q=Rich%20Dad%20Poor%20Dad%20Robert%20Kiyosaki",
      rights: "Copyrighted"
    },
    {
      key: "spotlight-seven-habits",
      title: "The 7 Habits of Highly Effective People",
      author: "Stephen R. Covey",
      category: "Personal development",
      summary: "A principle-centered approach to personal leadership, priorities and effective relationships.",
      coverUrl: "https://covers.openlibrary.org/b/id/10079937-L.jpg",
      sourceUrl: "https://openlibrary.org/search?q=The%207%20Habits%20of%20Highly%20Effective%20People%20Stephen%20Covey",
      rights: "Copyrighted"
    },
    {
      key: "spotlight-win-friends",
      title: "How to Win Friends and Influence People",
      author: "Dale Carnegie",
      category: "Communication",
      summary: "Practical advice on listening, appreciation and building cooperative relationships.",
      coverUrl: "https://covers.openlibrary.org/b/id/13314878-L.jpg",
      sourceUrl: "https://openlibrary.org/search?q=How%20to%20Win%20Friends%20and%20Influence%20People%20Dale%20Carnegie",
      rights: "Copyrighted"
    }
  ];

  const users = [
    {
      id: "student-maya",
      name: "Maya Chen",
      email: "maya@scholarscroll.local",
      role: "student",
      initials: "MC",
      demoPassword: "reader2026",
      passwordHash: "79ff5644f062a15f804fa0c478d8c70e96be9948572d8965b0a2b19697c201c7"
    },
    {
      id: "admin-elena",
      name: "Elena Brooks",
      email: "elena@scholarscroll.local",
      role: "admin",
      initials: "EB",
      demoPassword: "admin2026",
      passwordHash: "6051fc84a7a0d74c225fb18a496b09952da5642e60723ecae543298edd7d82d6"
    }
  ];

  const createInitialState = () => ({
    schemaVersion: 7,
    session: { currentUserId: null, authenticatedAt: null },
    catalogRecords: {},
    customBooks: [],
    readingActivity: {
      "student-maya": {
        "gutenberg-1342": {
          source: "gutendex",
          sourceId: 1342,
          startedAt: isoFromNow(-8),
          lastReadAt: isoFromNow(-1),
          completedAt: isoFromNow(-1),
          progress: 100,
          book: seedBooks["gutenberg-1342"]
        },
        "gutenberg-84": {
          source: "gutendex",
          sourceId: 84,
          startedAt: isoFromNow(-10),
          lastReadAt: isoFromNow(-4),
          completedAt: isoFromNow(-4),
          progress: 100,
          book: seedBooks["gutenberg-84"]
        }
      },
      "admin-elena": {}
    },
    /* One key per local calendar day on which the member read something. */
    readingDays: {
      "student-maya": [dayFromNow(-4), dayFromNow(-3), dayFromNow(-2), dayFromNow(-1), dayFromNow(0)],
      "admin-elena": []
    },
    readerState: {},
    savedBooks: {
      "student-maya": [],
      "admin-elena": []
    },
    /* Full snapshots so a saved title still renders without the API. */
    savedBookRecords: {
      "student-maya": {},
      "admin-elena": {}
    },
    achievements: [],
    badges: [],
    /* Legacy premium-unlock records. Retained so a future paid tier can reuse
       the schema; the current build never gates reading on them. */
    premiumUnlocks: {
      "student-maya": {},
      "admin-elena": {}
    },
    /* Redemption ledger keyed by certificate ID. Kept in state so a local reset
       clears it together with the rest of the demo data. */
    rewardClaims: {},
    preferences: {
      searchQuery: "",
      shareBaseUrl: "",
      reader: {
        fontSize: 1,
        theme: "paper",
        lineHeight: 1.95,
        pdfZoom: 1,
        layout: "portrait"
      }
    }
  });

  window.LibraryConfig = Object.freeze({
    APP_NAME: "ScholarScroll",
    APP_TAGLINE: "Online Student Library",
    DEMO_MODE: true,
    STATE_KEY: "scholarscroll-library-v7",
    LEGACY_STATE_KEYS: [
      "scholarscroll-library-v6",
      "lumina-live-library-v5",
      "lumina-library-dashboard-v4",
      "lumina-library-dashboard-v3"
    ],
    SCHEMA_VERSION: 7,
    GUTENDEX_BASE_URL: "https://gutendex.com/books/",
    TEXT_PROXY_BASE_URL: "https://r.jina.ai/",
    PDF_JS_VERSION: "6.4.299",
    CACHE_DATABASE_NAME: "scholarscroll-document-cache",
    CACHE_STORE_NAME: "documents",
    MAX_TEXT_BYTES: 12 * 1024 * 1024,
    MAX_PDF_BYTES: 50 * 1024 * 1024,
    AVID_READER_TARGET: 3,
    AVID_READER_WINDOW_DAYS: 7,
    STREAK_MILESTONES: [1, 7, 30, 180, 365],
    CERTIFICATE_REWARD_DAYS: 7,
    PREMIUM_BOOKS: premiumBooks,
    PREMIUM_SPOTLIGHT: premiumSpotlight,
    DAY_IN_MS,
    dayKey,
    seedBooks,
    premiumBooks,
    users,
    createInitialState
  });
})();
