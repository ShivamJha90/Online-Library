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

  /* A curated Hindi shelf. Most titles are public-domain scans hosted by the
     Internet Archive; the local Python backend proxies and caches their text
     so the browser never has to fight Archive.org's CORS rules. A few titles
     are link-only because no clean public-domain text copy was available. */
  const hindiBook = ({ key, title, author, category, summary, archiveId, archiveFile, externalUrl }) => {
    const reader = archiveId && archiveFile ? {
      engine: "text",
      sourceUrl: `https://archive.org/download/${encodeURIComponent(archiveId)}/${encodeURIComponent(archiveFile)}`,
      mimeType: "text/plain; charset=utf-8"
    } : null;
    return {
      key,
      source: "hindi",
      title,
      author,
      authors: [author],
      category,
      language: "hi",
      languages: ["hi"],
      summary,
      coverUrl: archiveId ? `https://archive.org/services/img/${encodeURIComponent(archiveId)}` : "",
      sourceUrl: archiveId ? `https://archive.org/details/${archiveId}` : externalUrl,
      downloadCount: 0,
      copyright: false,
      hindi: true,
      archive: archiveId ? { identifier: archiveId, file: archiveFile } : null,
      reader
    };
  };

  const hindiBooks = [
    hindiBook({
      key: "hindi-bhagavad-gita",
      title: "श्रीमद्भगवद्गीता",
      author: "वेद व्यास · गीताप्रेस संस्करण",
      category: "भगवद्गीता",
      summary: "कर्म, ज्ञान और भक्ति का अमर संवाद — श्रीकृष्ण और अर्जुन के बीच जीवन के अर्थ पर सरल हिंदी टीका सहित।",
      archiveId: "geeta_202007",
      archiveFile: "श्रीमद भगवत गीता Geeta_djvu.txt"
    }),
    hindiBook({
      key: "hindi-valmiki-ramayan",
      title: "वाल्मीकि रामायण · अयोध्याकांड",
      author: "महर्षि वाल्मीकि",
      category: "रामायण",
      summary: "राम के वनवास, भरत के त्याग और अयोध्या की भावनाओं का मार्मिक कांड — संस्कृत श्लोक और हिंदी अनुवाद सहित।",
      archiveId: "ramayan_202005",
      archiveFile: "बालमीकि रामायण अयोध्याकांड_djvu.txt"
    }),
    hindiBook({
      key: "hindi-ramcharitmanas",
      title: "रामचरितमानस",
      author: "गोस्वामी तुलसीदास",
      category: "रामायण",
      summary: "अवधी की सबसे प्रिय रामकथा — बालकांड से उत्तरकांड तक, दोहा-चौपाई की लय में जीवन की मर्यादा और भक्ति।",
      archiveId: "in.ernet.dli.2015.342236",
      archiveFile: "2015.342236.99999990231847_djvu.txt"
    }),
    hindiBook({
      key: "hindi-mahabharat-ashramvasik",
      title: "महाभारत · आश्रमवासिक पर्व",
      author: "वेद व्यास",
      category: "महाभारत",
      summary: "युद्ध के बाद हस्तिनापुर के राजा और वनगमन — वृद्धावस्था, राजधर्म और वनप्रस्थ की शिक्षा देने वाला पर्व।",
      archiveId: "15ashramvasikparva",
      archiveFile: "15ashramvasikparva_djvu.txt"
    }),
    hindiBook({
      key: "hindi-mahabharat-shalya",
      title: "महाभारत · शल्य पर्व",
      author: "वेद व्यास",
      category: "महाभारत",
      summary: "कुरुक्षेत्र का निर्णायक संग्राम, शल्य की सेनापतित्व और कर्ण-अर्जुन संघर्ष की गाथा।",
      archiveId: "09shalyaparva",
      archiveFile: "09shalyaparva_djvu.txt"
    }),
    hindiBook({
      key: "hindi-chanakya-niti",
      title: "सम्पूर्ण चाणक्य नीति",
      author: "आचार्य चाणक्य",
      category: "नीति और जीवन",
      summary: "राजनीति, मित्रता, परिश्रम और चरित्र पर चाणक्य के कालजयी सूत्र — आज के जीवन में सीधे काम आने वाली नीति।",
      archiveId: "hindi_202507",
      archiveFile: "सम्पूर्ण चाणक्य नीति Hindi_djvu.txt"
    }),
    hindiBook({
      key: "hindi-godaan",
      title: "गोदान",
      author: "प्रेमचंद",
      category: "उपन्यास",
      summary: "होरी और धनिया की कथा — किसानी, गरीबी, सपनों और सामाजिक बदलाव का हिंदी का सबसे बड़ा महाकाव्यात्मक उपन्यास।",
      archiveId: "godaan-upanyas-premchand-parikalpana",
      archiveFile: "Godaan upanyas -- Premchand --  Parikalpana_djvu.txt"
    }),
    hindiBook({
      key: "hindi-premchand-stories",
      title: "प्रेमचंद की कहानियाँ",
      author: "प्रेमचंद",
      category: "कहानी",
      summary: "ईदगाह, कफन, पूस की रात जैसी कहानियों का संग्रह — आम आदमी की करुणा, हास्य और संघर्ष।",
      archiveId: "StoriesByPremchand",
      archiveFile: "Stories By Premchand_djvu.txt"
    }),
    hindiBook({
      key: "hindi-bhagwat-puran",
      title: "भागवत पुराण",
      author: "वेद व्यास",
      category: "पुराण",
      summary: "श्रीकृष्ण की लीलाओं, भक्ति और दशावतार की कथाएँ — भारतीय भक्ति परंपरा का हृदय।",
      archiveId: "puran_bhagwat",
      archiveFile: "Bhagvat_djvu.txt"
    }),
    hindiBook({
      key: "hindi-shiv-puran",
      title: "शिव पुराण",
      author: "वेद व्यास",
      category: "पुराण",
      summary: "शिव की महिमा, ज्योतिर्लिंग, सती-कथा और शैव दर्शन — भोले शंकर की कथा का विस्तृत हिंदी वर्णन।",
      archiveId: "puran_shiv",
      archiveFile: "Shiv_djvu.txt"
    }),
    hindiBook({
      key: "hindi-vishnu-puran",
      title: "विष्णु पुराण",
      author: "वेद व्यास",
      category: "पुराण",
      summary: "सृष्टि, प्रलय, मन्वंतर और विष्णु के अवतारों की पुराणकथा — ब्रह्मांड के रहस्यों का हिंदी वर्णन।",
      archiveId: "vishnu-puran_hindi",
      archiveFile: "Vishnu Purana_djvu.txt"
    }),
    hindiBook({
      key: "hindi-kabir-bijak",
      title: "कबीर बीजक",
      author: "संत कबीर",
      category: "कविता और दर्शन",
      summary: "कबीर के साखी, सबद और रमैनी — सांप्रदायिकता और आडंबर पर तीखा प्रहार, भीतर की खोज का संदेश।",
      archiveId: "bijak",
      archiveFile: "कबीर साहेब का बीजक_djvu.txt"
    }),
    hindiBook({
      key: "hindi-hitopadesh",
      title: "हितोपदेश",
      author: "नारायण पंडित",
      category: "नीति और जीवन",
      summary: "मित्रता, विवेक और व्यवहार कौशल सिखाने वाली पशु-कथाएँ — पंचतंत्र परंपरा की सरल हिंदी प्रस्तुति।",
      archiveId: "hindi_202408",
      archiveFile: "हितोपदेश _ hindi_djvu.txt"
    }),
    hindiBook({
      key: "hindi-panchatantra",
      title: "पंचतंत्र की कहानियाँ",
      author: "विष्णु शर्मा",
      category: "नीति और जीवन",
      summary: "चालाक लोमड़ी, कौवे और शेर की कहानियों से जीवन की व्यावहारिक बुद्धि — हर उम्र के पाठकों के लिए।",
      archiveId: "panchan-part2",
      archiveFile: "panchan-part2_djvu.txt"
    }),
    hindiBook({
      key: "hindi-panchatantra-vistar",
      title: "पंचतंत्र · विस्तृत संस्करण",
      author: "विष्णु शर्मा",
      category: "नीति और जीवन",
      summary: "पंचतंत्र की अधिक कहानियाँ और विस्तृत टीका — राजनीति, मित्रता और व्यवहारिक ज्ञान का भंडार।",
      archiveId: "panchatantra0000vidy",
      archiveFile: "panchatantra0000vidy_djvu.txt"
    }),
    hindiBook({
      key: "hindi-yoga-vasistha",
      title: "योग वासिष्ठ",
      author: "महर्षि वाल्मीकि",
      category: "दर्शन",
      summary: "राम और वसिष्ठ का संवाद — मन, माया, वैराग्य और मुक्ति पर भारतीय दर्शन का सबसे गहरा ग्रंथ।",
      archiveId: "ag-1_20210526_202105",
      archiveFile: "AG-1_new_djvu.txt"
    }),
    hindiBook({
      key: "hindi-surdas",
      title: "सूरदास पदावली",
      author: "सूरदास",
      category: "कविता और दर्शन",
      summary: "कृष्ण-भक्ति की सर्वोत्तम पदावली — वात्सल्य, मिलन और विरह के भावों में डूबी ब्रजभाषा की कविता।",
      archiveId: "dli.language.1229",
      archiveFile: "dli.language.1229_djvu.txt"
    }),
    hindiBook({
      key: "hindi-meera-padawali",
      title: "मीराबाई पदावली",
      author: "मीराबाई",
      category: "कविता और दर्शन",
      summary: "गिरधर के प्रति मीरा की निर्मल भक्ति — राजमहल से वन तक, प्रेम और समर्पण के अमर पद।",
      externalUrl: "https://hi.wikisource.org/wiki/मीराबाई"
    }),
    hindiBook({
      key: "hindi-kautilya-arthashastra",
      title: "कौटिल्य अर्थशास्त्र",
      author: "आचार्य कौटिल्य",
      category: "नीति और जीवन",
      summary: "राज्य, अर्थ, न्याय और कूटनीति का प्राचीन भारतीय शास्त्र — चाणक्य की राजनीतिक बुद्धि का मूल ग्रंथ।",
      externalUrl: "https://archive.org/search?query=अर्थशास्त्र"
    }),
    hindiBook({
      key: "hindi-garud-puran",
      title: "गरुड़ पुराण",
      author: "वेद व्यास",
      category: "पुराण",
      summary: "जीवन, मृत्यु और परलोक की अवधारणा — गरुड़ और विष्णु के संवाद में नैतिकता और कर्म का वर्णन।",
      externalUrl: "https://archive.org/details/full-garuda-puran-in-hindi-mannmandir-garudpuran"
    }),
    hindiBook({
      key: "hindi-charak-samhita",
      title: "चरक संहिता",
      author: "महर्षि चरक",
      category: "आयुर्वेद",
      summary: "आयुर्वेद का आधारभूत ग्रंथ — शरीर, रोग, निदान और स्वस्थ जीवनचर्या पर प्राचीन भारतीय चिकित्सा-दर्शन।",
      archiveId: "in.ernet.dli.2015.342513",
      archiveFile: "2015.342513.99999990231619_djvu.txt"
    }),
    hindiBook({
      key: "hindi-divya-darshan",
      title: "दिव्य दर्शन · योग शास्त्र",
      author: "योग शास्त्र परंपरा",
      category: "योग और अध्यात्म",
      summary: "योग की वैज्ञानिक विवेचना — ध्यान, संयम और आत्मबोध के साधनों पर प्राचीन शास्त्रों के आधार पर सरल प्रस्तुति।",
      archiveId: "in.ernet.dli.2015.343178",
      archiveFile: "2015.343178.--_djvu.txt"
    }),
    hindiBook({
      key: "hindi-andher-nagari",
      title: "अंधेर नगरी",
      author: "भारतेंदु हरिश्चंद्र",
      category: "नाटक",
      summary: "राजा की मूर्खता पर तीखा व्यंग्य — मुंशी-विदूषक की बुद्धि और आम आदमी की दशा दिखाने वाला कालजयी हिंदी नाटक।",
      archiveId: "andheri-nagri-opt-1",
      archiveFile: "Andheri Nagri_opt1_djvu.txt"
    }),
    hindiBook({
      key: "hindi-satya-ke-prayog",
      title: "सत्य के प्रयोग अथवा आत्मकथा",
      author: "मोहनदास करमचंद गांधी",
      category: "आत्मकथा",
      summary: "गांधीजी की आत्मकथा — बाल्यकाल, दक्षिण अफ्रीका, सत्याग्रह और आत्म-संयम की ईमानदार जीवनयात्रा।",
      archiveId: "satyakeprayog-gandhi-h1",
      archiveFile: "satyakeprayog-gandhi-h1_djvu.txt"
    }),
    hindiBook({
      key: "hindi-purva-madhyakalin-bharat",
      title: "पूर्व मध्यकालीन भारत",
      author: "वासुदेव उपाध्याय",
      category: "इतिहास",
      summary: "सातवीं से बारहवीं सदी तक उत्तर भारत का सांस्कृतिक इतिहास — राजवंश, कला, धर्म और समाज का विस्तृत चित्रण।",
      archiveId: "vasudev-upadhyay",
      archiveFile: "पूर्व-मध्यकालीन भारत (Vasudev Upadhyay)_djvu.txt"
    }),
    hindiBook({
      key: "hindi-bharatiya-vigyan",
      title: "भारतीय विज्ञान की कहानी",
      author: "गुणाकर मुळे",
      category: "विज्ञान",
      summary: "प्राचीन भारत की गणित, खगोल, चिकित्सा और तकनीक की यात्रा — सरल भाषा में भारतीय वैज्ञानिक परंपरा।",
      archiveId: "bhartiya-vigyan-ki-kahani-hindi",
      archiveFile: "BHARTIYA VIGYAN KI KAHANI - HINDI_djvu.txt"
    }),
    hindiBook({
      key: "hindi-samagra-vyakarana",
      title: "समग्र हिंदी व्याकरण",
      author: "डॉ. प्रेम भारती",
      category: "हिंदी भाषा",
      summary: "हिंदी व्याकरण का संपूर्ण संदर्भ — वर्ण, शब्द, वाक्य, अलंकार और रचना-कौशल पर व्यवस्थित मार्गदर्शन।",
      archiveId: "dli.language.0817",
      archiveFile: "dli.language.0817_djvu.txt"
    }),
    hindiBook({
      key: "hindi-jyotish-ratnakar",
      title: "ज्योतिष रत्नाकर",
      author: "देवकीनंदन सिंह",
      category: "ज्योतिष",
      summary: "ग्रह, राशि, भाव और दशा पर आधारित पारंपरिक भारतीय ज्योतिष का विस्तृत ग्रंथ — शास्त्रीय परंपरा का संदर्भ।",
      archiveId: "jyotish-ratnakar",
      archiveFile: "ज्योतिष रत्नाकर  Jyotish Ratnakar Devkinandan Singh _djvu.txt"
    }),
    hindiBook({
      key: "hindi-vigyan-bhairav",
      title: "विज्ञान भैरव तंत्र",
      author: "तंत्र परंपरा",
      category: "तंत्र और दर्शन",
      summary: "भैरव और भैरवी के संवाद में चेतना, ध्यान और आत्मबोध के साधन — कश्मीर शैव परंपरा का प्रमुख तंत्र ग्रंथ।",
      archiveId: "vigyan-bhairav-tantra-hindi-book",
      archiveFile: "VIGYAN BHAIRAV (RUDRYAMAL TANTRA KA GOOD REHASYA)_djvu.txt"
    })
  ];

  /* A small bundled shelf used only when Gutendex cannot be reached and no
     cached results exist. These are public-domain Project Gutenberg editions
     with cover and text URLs, so the storefront still shows readable books
     instead of an empty error panel. */
  const starterBook = (id, title, author, category, downloadCount) => ({
    key: `gutenberg-${id}`,
    id,
    source: "gutendex",
    starter: true,
    title,
    author,
    authors: [author],
    category,
    subjects: [],
    languages: ["en"],
    summary: `${title} by ${author}, a public-domain edition available through Project Gutenberg.`,
    coverUrl: `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`,
    sourceUrl: `https://www.gutenberg.org/ebooks/${id}`,
    downloadCount,
    copyright: false,
    reader: {
      engine: "text",
      sourceUrl: `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
      mimeType: "text/plain; charset=utf-8"
    }
  });

  const offlineStarterBooks = [
    starterBook(1342, "Pride and Prejudice", "Jane Austen", "Classic fiction", 72000),
    starterBook(84, "Frankenstein; Or, The Modern Prometheus", "Mary Shelley", "Gothic", 64000),
    starterBook(11, "Alice's Adventures in Wonderland", "Lewis Carroll", "Children", 59000),
    starterBook(1661, "The Adventures of Sherlock Holmes", "Arthur Conan Doyle", "Mystery", 55000),
    starterBook(2701, "Moby Dick; Or, The Whale", "Herman Melville", "Adventure", 51000),
    starterBook(514, "Little Women", "Louisa May Alcott", "Classic fiction", 47000),
    starterBook(35, "The Time Machine", "H. G. Wells", "Science fiction", 43000),
    starterBook(55, "The Wonderful Wizard of Oz", "L. Frank Baum", "Children", 40000),
    starterBook(2680, "Meditations", "Marcus Aurelius", "Philosophy", 37000),
    starterBook(132, "The Art of War", "Sun Tzu", "Strategy", 34000),
    starterBook(205, "Walden", "Henry David Thoreau", "Nature", 31000),
    starterBook(174, "The Picture of Dorian Gray", "Oscar Wilde", "Gothic", 29000)
  ];

  const languageShelves = {
    "en": {
      "label": "English",
      "count": 63390,
      "books": [
        {
          "key": "gutenberg-1342",
          "id": 1342,
          "source": "gutendex",
          "title": "Pride and Prejudice",
          "author": "Jane Austen",
          "authors": [
            "Jane Austen"
          ],
          "category": "Best Books Ever Listings",
          "subjects": [
            "Courtship -- Fiction",
            "Domestic fiction",
            "England -- Fiction",
            "Love stories"
          ],
          "languages": [
            "en"
          ],
          "summary": "An English public-domain title by Jane Austen, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/1342",
          "downloadCount": 208430,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/1342.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-84",
          "id": 84,
          "source": "gutendex",
          "title": "Frankenstein; or, The modern Prometheus",
          "author": "Mary Wollstonecraft Shelley",
          "authors": [
            "Mary Wollstonecraft Shelley"
          ],
          "category": "British Literature",
          "subjects": [
            "Frankenstein's monster (Fictitious character) -- Fiction",
            "Frankenstein, Victor (Fictitious character) -- Fiction",
            "Gothic fiction",
            "Horror tales"
          ],
          "languages": [
            "en"
          ],
          "summary": "An English public-domain title by Mary Wollstonecraft Shelley, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/84/pg84.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/84",
          "downloadCount": 182729,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/84.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-2701",
          "id": 2701,
          "source": "gutendex",
          "title": "Moby Dick; Or, The Whale",
          "author": "Herman Melville",
          "authors": [
            "Herman Melville"
          ],
          "category": "Best Books Ever Listings",
          "subjects": [
            "Adventure stories",
            "Ahab, Captain (Fictitious character) -- Fiction",
            "Mentally ill -- Fiction",
            "Psychological fiction"
          ],
          "languages": [
            "en"
          ],
          "summary": "An English public-domain title by Herman Melville, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/2701/pg2701.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/2701",
          "downloadCount": 172569,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/2701.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-11",
          "id": 11,
          "source": "gutendex",
          "title": "Alice's Adventures in Wonderland",
          "author": "Lewis Carroll",
          "authors": [
            "Lewis Carroll"
          ],
          "category": "British Literature",
          "subjects": [
            "Alice (Fictitious character from Carroll) -- Juvenile fiction",
            "Children's stories",
            "Fantasy fiction",
            "Imaginary places -- Juvenile fiction"
          ],
          "languages": [
            "en"
          ],
          "summary": "An English public-domain title by Lewis Carroll, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/11/pg11.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/11",
          "downloadCount": 121623,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/11.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-1661",
          "id": 1661,
          "source": "gutendex",
          "title": "The Adventures of Sherlock Holmes",
          "author": "Arthur Conan Doyle",
          "authors": [
            "Arthur Conan Doyle"
          ],
          "category": "Banned Books from Anne Haight's list",
          "subjects": [
            "Detective and mystery stories, English",
            "Holmes, Sherlock (Fictitious character) -- Fiction",
            "Private investigators -- England -- Fiction"
          ],
          "languages": [
            "en"
          ],
          "summary": "An English public-domain title by Arthur Conan Doyle, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/1661/pg1661.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/1661",
          "downloadCount": 96353,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/1661.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-37683",
          "id": 37683,
          "source": "gutendex",
          "title": "Chambers's Twentieth Century Dictionary (part 1 of 4: A-D)",
          "author": "Unknown author",
          "authors": [
            "Unknown author"
          ],
          "category": "Encyclopedias/Dictionaries/Reference",
          "subjects": [
            "English language -- Dictionaries"
          ],
          "languages": [
            "en"
          ],
          "summary": "An English public-domain title by Unknown author, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/37683/pg37683.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/37683",
          "downloadCount": 94005,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/37683.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-1513",
          "id": 1513,
          "source": "gutendex",
          "title": "Romeo and Juliet",
          "author": "William Shakespeare",
          "authors": [
            "William Shakespeare"
          ],
          "category": "British Literature",
          "subjects": [
            "Conflict of generations -- Drama",
            "Juliet (Fictitious character) -- Drama",
            "Romeo (Fictitious character) -- Drama",
            "Tragedies (Drama)"
          ],
          "languages": [
            "en"
          ],
          "summary": "An English public-domain title by William Shakespeare, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/1513/pg1513.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/1513",
          "downloadCount": 81893,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/1513.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-345",
          "id": 345,
          "source": "gutendex",
          "title": "Dracula",
          "author": "Bram Stoker",
          "authors": [
            "Bram Stoker"
          ],
          "category": "British Literature",
          "subjects": [
            "Dracula, Count (Fictitious character) -- Fiction",
            "Epistolary fiction",
            "Gothic fiction",
            "Horror tales"
          ],
          "languages": [
            "en"
          ],
          "summary": "An English public-domain title by Bram Stoker, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/345/pg345.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/345",
          "downloadCount": 78131,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/345.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        }
      ]
    },
    "fr": {
      "label": "French",
      "count": 4269,
      "books": [
        {
          "key": "gutenberg-78027",
          "id": 78027,
          "source": "gutendex",
          "title": "Les enchantements de la forêt",
          "author": "André Theuriet",
          "authors": [
            "André Theuriet"
          ],
          "category": "Natural history",
          "subjects": [
            "Natural history -- Outdoor books"
          ],
          "languages": [
            "fr"
          ],
          "summary": "A French public-domain title by André Theuriet, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78027/pg78027.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78027",
          "downloadCount": 47001,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78027.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-62215",
          "id": 62215,
          "source": "gutendex",
          "title": "Le Fantôme de l'Opéra",
          "author": "Gaston Leroux",
          "authors": [
            "Gaston Leroux"
          ],
          "category": "Crime, Thrillers and Mystery",
          "subjects": [
            "Composers -- Fiction",
            "French fiction -- 20th century",
            "Horror tales",
            "Musical fiction"
          ],
          "languages": [
            "fr"
          ],
          "summary": "A French public-domain title by Gaston Leroux, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/62215/pg62215.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/62215",
          "downloadCount": 38259,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/62215.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-78041",
          "id": 78041,
          "source": "gutendex",
          "title": "En pays lointain",
          "author": "Jack London",
          "authors": [
            "Jack London"
          ],
          "category": "Adventure stories, American",
          "subjects": [
            "Adventure stories, American -- Translations into French",
            "Gold mines and mining -- Fiction",
            "Klondike River Valley (Yukon) -- Fiction",
            "Yukon River Valley (Yukon and Alaska) -- Fiction"
          ],
          "languages": [
            "fr"
          ],
          "summary": "A French public-domain title by Jack London, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78041/pg78041.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78041",
          "downloadCount": 24825,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78041.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-78064",
          "id": 78064,
          "source": "gutendex",
          "title": "Lucifer : roman moderne",
          "author": "Maurice Magre",
          "authors": [
            "Maurice Magre"
          ],
          "category": "French fiction",
          "subjects": [
            "French fiction -- 20th century"
          ],
          "languages": [
            "fr"
          ],
          "summary": "A French public-domain title by Maurice Magre, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78064/pg78064.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78064",
          "downloadCount": 24659,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78064.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-78074",
          "id": 78074,
          "source": "gutendex",
          "title": "Chroniques de J. Froissart, tome 09/13 : 1377-1380 (Depuis la prise de Bergerac jusqu'à la mort de Charles V)",
          "author": "Jean Froissart",
          "authors": [
            "Jean Froissart"
          ],
          "category": "Burgundy (France)",
          "subjects": [
            "Burgundy (France) -- History",
            "Europe -- History -- 476-1492",
            "Flanders -- History",
            "France -- History -- House of Valois, 1328-1589"
          ],
          "languages": [
            "fr"
          ],
          "summary": "A French public-domain title by Jean Froissart, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78074/pg78074.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78074",
          "downloadCount": 24510,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78074.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-78063",
          "id": 78063,
          "source": "gutendex",
          "title": "Le jeune Européen",
          "author": "Pierre Drieu La Rochelle",
          "authors": [
            "Pierre Drieu La Rochelle"
          ],
          "category": "French essays",
          "subjects": [
            "French essays"
          ],
          "languages": [
            "fr"
          ],
          "summary": "A French public-domain title by Pierre Drieu La Rochelle, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78063/pg78063.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78063",
          "downloadCount": 24508,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78063.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-78069",
          "id": 78069,
          "source": "gutendex",
          "title": "Deux générations",
          "author": "Tolstoy, Leo, graf",
          "authors": [
            "Tolstoy, Leo, graf"
          ],
          "category": "Country life",
          "subjects": [
            "Country life -- Russia -- Fiction",
            "Fathers and sons -- Fiction",
            "Hussars -- Fiction",
            "Russia -- Social life and customs -- 19th century -- Fiction"
          ],
          "languages": [
            "fr"
          ],
          "summary": "A French public-domain title by Tolstoy, Leo, graf, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78069/pg78069.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78069",
          "downloadCount": 24490,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78069.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-78021",
          "id": 78021,
          "source": "gutendex",
          "title": "L'imposture",
          "author": "Georges Bernanos",
          "authors": [
            "Georges Bernanos"
          ],
          "category": "Catholic Church",
          "subjects": [
            "Catholic Church -- Clergy -- Fiction",
            "Paris (France) -- Fiction",
            "Religious fiction"
          ],
          "languages": [
            "fr"
          ],
          "summary": "A French public-domain title by Georges Bernanos, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78021/pg78021.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78021",
          "downloadCount": 24441,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78021.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        }
      ]
    },
    "de": {
      "label": "German",
      "count": 2483,
      "books": [
        {
          "key": "gutenberg-78079",
          "id": 78079,
          "source": "gutendex",
          "title": "Allgemeine Physiologie",
          "author": "Max Verworn",
          "authors": [
            "Max Verworn"
          ],
          "category": "Physiology, Comparative",
          "subjects": [
            "Physiology, Comparative"
          ],
          "languages": [
            "de"
          ],
          "summary": "A German public-domain title by Max Verworn, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78079/pg78079.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78079",
          "downloadCount": 24849,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78079.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-78026",
          "id": 78026,
          "source": "gutendex",
          "title": "Skizzen einer Fußreise durch Oesterreich, Steiermark, Kärnthen, Salzburg, Berchtesgaden, Tirol und Baiern nach Wien, : nebst einer romantisch pittoresken Darstellung mehrerer Ritterburgen und ihrer Volkssagen, Gebirgsgegenden und Eisglätscher auf dieser Wanderung, unternommen im Jahre 1825 von Joseph Kyselak. (2/2)",
          "author": "Josef Kyselak",
          "authors": [
            "Josef Kyselak"
          ],
          "category": "Austria",
          "subjects": [
            "Austria -- Description and travel",
            "Berchtesgaden (Germany) -- Description and travel"
          ],
          "languages": [
            "de"
          ],
          "summary": "A German public-domain title by Josef Kyselak, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78026/pg78026.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78026",
          "downloadCount": 24829,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78026.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-78125",
          "id": 78125,
          "source": "gutendex",
          "title": "Liebe ist ewig : Roman",
          "author": "Wilhelm von Polenz",
          "authors": [
            "Wilhelm von Polenz"
          ],
          "category": "German fiction",
          "subjects": [
            "German fiction -- 20th century"
          ],
          "languages": [
            "de"
          ],
          "summary": "A German public-domain title by Wilhelm von Polenz, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78125/pg78125.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78125",
          "downloadCount": 24517,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78125.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-78056",
          "id": 78056,
          "source": "gutendex",
          "title": "Urwald",
          "author": "R. H. (Raoul Heinrich) Francé",
          "authors": [
            "R. H. (Raoul Heinrich) Francé"
          ],
          "category": "Forests and forestry",
          "subjects": [
            "Forests and forestry -- Tropics",
            "Rain forests"
          ],
          "languages": [
            "de"
          ],
          "summary": "A German public-domain title by R. H. (Raoul Heinrich) Francé, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78056/pg78056.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78056",
          "downloadCount": 24205,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78056.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-78030",
          "id": 78030,
          "source": "gutendex",
          "title": "Kloster Himmelpforte : Geschichtliches Drama in 4 Akten",
          "author": "Robert Falke",
          "authors": [
            "Robert Falke"
          ],
          "category": "Historical drama",
          "subjects": [
            "Historical drama",
            "Luther, Martin, 1483-1546 -- Drama"
          ],
          "languages": [
            "de"
          ],
          "summary": "A German public-domain title by Robert Falke, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78030/pg78030.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78030",
          "downloadCount": 24114,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78030.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-22367",
          "id": 22367,
          "source": "gutendex",
          "title": "Die Verwandlung",
          "author": "Franz Kafka",
          "authors": [
            "Franz Kafka"
          ],
          "category": "German Literature",
          "subjects": [
            "Metamorphosis -- Fiction",
            "Psychological fiction"
          ],
          "languages": [
            "de"
          ],
          "summary": "A German public-domain title by Franz Kafka, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/22367/pg22367.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/22367",
          "downloadCount": 15564,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/22367.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-66452",
          "id": 66452,
          "source": "gutendex",
          "title": "Die Liebe: Novelle",
          "author": "Hans Kaltneker",
          "authors": [
            "Hans Kaltneker"
          ],
          "category": "German Literature",
          "subjects": [
            "Austrian fiction -- 20th century"
          ],
          "languages": [
            "de"
          ],
          "summary": "A German public-domain title by Hans Kaltneker, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/66452/pg66452.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/66452",
          "downloadCount": 14525,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/66452.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-5740",
          "id": 5740,
          "source": "gutendex",
          "title": "Tractatus Logico-Philosophicus",
          "author": "Ludwig Wittgenstein",
          "authors": [
            "Ludwig Wittgenstein"
          ],
          "category": "DE Sachbuch",
          "subjects": [
            "Language and languages -- Philosophy",
            "Logic, Symbolic and mathematical"
          ],
          "languages": [
            "de",
            "en"
          ],
          "summary": "A German public-domain title by Ludwig Wittgenstein, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/5740/pg5740.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/5740",
          "downloadCount": 13240,
          "copyright": false,
          "reader": null
        }
      ]
    },
    "es": {
      "label": "Spanish",
      "count": 923,
      "books": [
        {
          "key": "gutenberg-61851",
          "id": 61851,
          "source": "gutendex",
          "title": "El crimen y el castigo",
          "author": "Fyodor Dostoyevsky",
          "authors": [
            "Fyodor Dostoyevsky"
          ],
          "category": "Classics of Literature",
          "subjects": [
            "Crime -- Psychological aspects -- Fiction",
            "Detective and mystery stories",
            "Murder -- Fiction",
            "Psychological fiction"
          ],
          "languages": [
            "es"
          ],
          "summary": "A Spanish public-domain title by Fyodor Dostoyevsky, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/61851/pg61851.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/61851",
          "downloadCount": 29958,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/61851.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-78068",
          "id": 78068,
          "source": "gutendex",
          "title": "Los miserables - Tomo 2 (de 2)",
          "author": "Victor Hugo",
          "authors": [
            "Victor Hugo"
          ],
          "category": "Epic literature",
          "subjects": [
            "Epic literature",
            "Ex-convicts -- Fiction",
            "Historical fiction",
            "Orphans -- Fiction"
          ],
          "languages": [
            "es"
          ],
          "summary": "A Spanish public-domain title by Victor Hugo, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78068/pg78068.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78068",
          "downloadCount": 25344,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78068.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-78052",
          "id": 78052,
          "source": "gutendex",
          "title": "Andanzas y visiones españolas",
          "author": "Miguel de Unamuno",
          "authors": [
            "Miguel de Unamuno"
          ],
          "category": "Spain",
          "subjects": [
            "Spain -- Description and travel"
          ],
          "languages": [
            "es"
          ],
          "summary": "A Spanish public-domain title by Miguel de Unamuno, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78052/pg78052.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78052",
          "downloadCount": 24924,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78052.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-2000",
          "id": 2000,
          "source": "gutendex",
          "title": "Don Quijote",
          "author": "Miguel de Cervantes Saavedra",
          "authors": [
            "Miguel de Cervantes Saavedra"
          ],
          "category": "6 Best Loved Spanish Literary Classics",
          "subjects": [
            "Knights and knighthood -- Spain -- Fiction",
            "Picaresque literature",
            "Romances",
            "Spain -- Social life and customs -- 16th century -- Fiction"
          ],
          "languages": [
            "es"
          ],
          "summary": "A Spanish public-domain title by Miguel de Cervantes Saavedra, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/2000/pg2000.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/2000",
          "downloadCount": 23030,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/2000.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-58221",
          "id": 58221,
          "source": "gutendex",
          "title": "La Odisea",
          "author": "Homer",
          "authors": [
            "Homer"
          ],
          "category": "Classics of Literature",
          "subjects": [
            "Epic poetry, Greek -- Translations into Spanish",
            "Odysseus, King of Ithaca (Mythological character)"
          ],
          "languages": [
            "es"
          ],
          "summary": "A Spanish public-domain title by Homer, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/58221/pg58221.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/58221",
          "downloadCount": 7904,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/58221.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-21144",
          "id": 21144,
          "source": "gutendex",
          "title": "Las Fábulas de Esopo, Vol. 03",
          "author": "Aesop",
          "authors": [
            "Aesop",
            "George Fyler Townsend"
          ],
          "category": "Fables, Greek",
          "subjects": [
            "Fables, Greek -- Translations into Spanish"
          ],
          "languages": [
            "es"
          ],
          "summary": "A Spanish public-domain title by Aesop, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/21144/pg21144.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/21144",
          "downloadCount": 7219,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/files/21144/21144-readme.txt",
            "mimeType": "text/plain; charset=us-ascii"
          }
        },
        {
          "key": "gutenberg-20738",
          "id": 20738,
          "source": "gutendex",
          "title": "Diccionario Ingles-Español-Tagalog: Con partes de la oracion y pronunciacion figurada",
          "author": "Sofronio G. Calderón",
          "authors": [
            "Sofronio G. Calderón"
          ],
          "category": "Encyclopedias/Dictionaries/Reference",
          "subjects": [
            "English language -- Dictionaries -- Polyglot",
            "English language -- Dictionaries -- Spanish",
            "English language -- Dictionaries -- Tagalog"
          ],
          "languages": [
            "en",
            "es",
            "tl"
          ],
          "summary": "A Spanish public-domain title by Sofronio G. Calderón, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/20738/pg20738.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/20738",
          "downloadCount": 6454,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/20738.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-21143",
          "id": 21143,
          "source": "gutendex",
          "title": "Las Fábulas de Esopo, Vol. 01",
          "author": "Aesop",
          "authors": [
            "Aesop",
            "George Fyler Townsend"
          ],
          "category": "Fables, Greek",
          "subjects": [
            "Fables, Greek -- Translations into Spanish"
          ],
          "languages": [
            "es"
          ],
          "summary": "A Spanish public-domain title by Aesop, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/21143/pg21143.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/21143",
          "downloadCount": 5410,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/files/21143/21143-readme.txt",
            "mimeType": "text/plain; charset=us-ascii"
          }
        }
      ]
    },
    "it": {
      "label": "Italian",
      "count": 1119,
      "books": [
        {
          "key": "gutenberg-61885",
          "id": 61885,
          "source": "gutendex",
          "title": "Ricordi d'infanzia e di scuola: seguìti da Bambole e marionette, Gente minima, Piccoli studenti, Adolescenti, Due di spade e due di cuori",
          "author": "Edmondo De Amicis",
          "authors": [
            "Edmondo De Amicis"
          ],
          "category": "Biographies",
          "subjects": [
            "De Amicis, Edmondo, 1846-1908"
          ],
          "languages": [
            "it"
          ],
          "summary": "An Italian public-domain title by Edmondo De Amicis, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/61885/pg61885.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/61885",
          "downloadCount": 9700,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/61885.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-1012",
          "id": 1012,
          "source": "gutendex",
          "title": "La Divina Commedia di Dante",
          "author": "Dante Alighieri",
          "authors": [
            "Dante Alighieri"
          ],
          "category": "Banned Books from Anne Haight's list",
          "subjects": [
            "Epic poetry, Italian",
            "Italian poetry -- To 1400"
          ],
          "languages": [
            "it"
          ],
          "summary": "An Italian public-domain title by Dante Alighieri, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/1012/pg1012.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/1012",
          "downloadCount": 9121,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/1012.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-44549",
          "id": 44549,
          "source": "gutendex",
          "title": "Il libro di Sidrach: testo inedito del secolo XIV: pubblicato da Adolfo Bartoli",
          "author": "active 13th century Sidrac",
          "authors": [
            "active 13th century Sidrac"
          ],
          "category": "History - Medieval/Middle Ages",
          "subjects": [
            "Civilization, Medieval -- Early works to 1800",
            "Encyclopedias and dictionaries -- Early works to 1600",
            "Science, Medieval -- Early works to 1800"
          ],
          "languages": [
            "it"
          ],
          "summary": "An Italian public-domain title by active 13th century Sidrac, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/44549/pg44549.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/44549",
          "downloadCount": 5239,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/44549.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-19517",
          "id": 19517,
          "source": "gutendex",
          "title": "Le avventure di Pinocchio",
          "author": "Carlo Collodi",
          "authors": [
            "Carlo Collodi"
          ],
          "category": "IT Letteratura per ragazzi",
          "subjects": [
            "Fairy tales",
            "Pinocchio (Fictitious character) -- Juvenile fiction",
            "Puppets -- Juvenile fiction"
          ],
          "languages": [
            "it"
          ],
          "summary": "An Italian public-domain title by Carlo Collodi, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/19517/pg19517.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/19517",
          "downloadCount": 4827,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/files/19517/19517.txt",
            "mimeType": "text/plain; charset=us-ascii"
          }
        },
        {
          "key": "gutenberg-52484",
          "id": 52484,
          "source": "gutendex",
          "title": "Le avventure di Pinocchio: Storia di un burattino",
          "author": "Carlo Collodi",
          "authors": [
            "Carlo Collodi"
          ],
          "category": "Children & Young Adult Reading",
          "subjects": [
            "Fairy tales",
            "Pinocchio (Fictitious character) -- Juvenile fiction",
            "Puppets -- Juvenile fiction"
          ],
          "languages": [
            "it"
          ],
          "summary": "An Italian public-domain title by Carlo Collodi, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/52484/pg52484.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/52484",
          "downloadCount": 3543,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/52484.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-38720",
          "id": 38720,
          "source": "gutendex",
          "title": "L'amore che torna: romanzo",
          "author": "Guido da Verona",
          "authors": [
            "Guido da Verona"
          ],
          "category": "Novels",
          "subjects": [
            "Italian fiction"
          ],
          "languages": [
            "it"
          ],
          "summary": "An Italian public-domain title by Guido da Verona, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/38720/pg38720.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/38720",
          "downloadCount": 3302,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/38720.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-25178",
          "id": 25178,
          "source": "gutendex",
          "title": "Damiano: Storia di una povera famiglia",
          "author": "Giulio Carcano",
          "authors": [
            "Giulio Carcano"
          ],
          "category": "Novels",
          "subjects": [
            "Fiction"
          ],
          "languages": [
            "it"
          ],
          "summary": "An Italian public-domain title by Giulio Carcano, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/25178/pg25178.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/25178",
          "downloadCount": 3251,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/25178.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-38628",
          "id": 38628,
          "source": "gutendex",
          "title": "Vecchie storie d'amore",
          "author": "Adolfo Albertazzi",
          "authors": [
            "Adolfo Albertazzi"
          ],
          "category": "Romance",
          "subjects": [
            "Fiction",
            "Short stories, Italian"
          ],
          "languages": [
            "it"
          ],
          "summary": "An Italian public-domain title by Adolfo Albertazzi, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/38628/pg38628.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/38628",
          "downloadCount": 3183,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/38628.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        }
      ]
    },
    "pt": {
      "label": "Portuguese",
      "count": 657,
      "books": [
        {
          "key": "gutenberg-62383",
          "id": 62383,
          "source": "gutendex",
          "title": "A Biblia Sagrada, Contendo o Velho e o Novo Testamento",
          "author": "Unknown author",
          "authors": [
            "Unknown author"
          ],
          "category": "Religion/Spirituality",
          "subjects": [
            "Bible"
          ],
          "languages": [
            "pt"
          ],
          "summary": "A Portuguese public-domain title by Unknown author, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/62383/pg62383.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/62383",
          "downloadCount": 47118,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/62383.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-55752",
          "id": 55752,
          "source": "gutendex",
          "title": "Dom Casmurro",
          "author": "Machado de Assis",
          "authors": [
            "Machado de Assis"
          ],
          "category": "Novels",
          "subjects": [
            "Adultery -- Fiction",
            "Authorship -- Fiction",
            "Catholic Church -- Fiction",
            "Reminiscing in old age -- Fiction"
          ],
          "languages": [
            "pt"
          ],
          "summary": "A Portuguese public-domain title by Machado de Assis, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/55752/pg55752.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/55752",
          "downloadCount": 5409,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/55752.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-31552",
          "id": 31552,
          "source": "gutendex",
          "title": "Novo dicionário da língua portuguesa",
          "author": "Cândido de Figueiredo",
          "authors": [
            "Cândido de Figueiredo"
          ],
          "category": "Encyclopedias/Dictionaries/Reference",
          "subjects": [
            "Portuguese language -- Dictionaries"
          ],
          "languages": [
            "pt"
          ],
          "summary": "A Portuguese public-domain title by Cândido de Figueiredo, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/31552/pg31552.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/31552",
          "downloadCount": 5369,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/31552.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-3333",
          "id": 3333,
          "source": "gutendex",
          "title": "Os Lusíadas",
          "author": "Luís de Camões",
          "authors": [
            "Luís de Camões"
          ],
          "category": "Classics of Literature",
          "subjects": [
            "Epic poetry, Portuguese",
            "Explorers -- Portugal -- Poetry",
            "Gama, Vasco da, 1469-1524 -- Poetry",
            "India -- Discovery and exploration -- Poetry"
          ],
          "languages": [
            "pt"
          ],
          "summary": "A Portuguese public-domain title by Luís de Camões, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/3333/pg3333.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/3333",
          "downloadCount": 3735,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/3333.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-54829",
          "id": 54829,
          "source": "gutendex",
          "title": "Memorias Posthumas de Braz Cubas",
          "author": "Machado de Assis",
          "authors": [
            "Machado de Assis"
          ],
          "category": "Novels",
          "subjects": [
            "Brazil -- Fiction",
            "Dead -- Fiction",
            "Humorous stories",
            "Rich people -- Fiction"
          ],
          "languages": [
            "pt"
          ],
          "summary": "A Portuguese public-domain title by Machado de Assis, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/54829/pg54829.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/54829",
          "downloadCount": 2827,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/54829.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-23400",
          "id": 23400,
          "source": "gutendex",
          "title": "A Lenda da Meia-Noite",
          "author": "Manuel Pinheiro Chagas",
          "authors": [
            "Manuel Pinheiro Chagas"
          ],
          "category": "Mythology, Legends & Folklore",
          "subjects": [
            "Portuguese fiction -- 19th century"
          ],
          "languages": [
            "pt"
          ],
          "summary": "A Portuguese public-domain title by Manuel Pinheiro Chagas, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/23400/pg23400.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/23400",
          "downloadCount": 2240,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/23400.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-40409",
          "id": 40409,
          "source": "gutendex",
          "title": "Os Maias: episodios da vida romantica",
          "author": "Eça de Queirós",
          "authors": [
            "Eça de Queirós"
          ],
          "category": "Novels",
          "subjects": [
            "Portugal -- Fiction"
          ],
          "languages": [
            "pt"
          ],
          "summary": "A Portuguese public-domain title by Eça de Queirós, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/40409/pg40409.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/40409",
          "downloadCount": 2083,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/40409.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-22044",
          "id": 22044,
          "source": "gutendex",
          "title": "Indice chronologico dos factos mais notaveis da Historia do Brasil: desde seu descobrimento em 1500 até 1849",
          "author": "Agostinho Marques Perdigão Malheiro",
          "authors": [
            "Agostinho Marques Perdigão Malheiro"
          ],
          "category": "History - Other",
          "subjects": [
            "Brazil -- History"
          ],
          "languages": [
            "pt"
          ],
          "summary": "A Portuguese public-domain title by Agostinho Marques Perdigão Malheiro, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/22044/pg22044.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/22044",
          "downloadCount": 1943,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/22044.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        }
      ]
    },
    "nl": {
      "label": "Dutch",
      "count": 1127,
      "books": [
        {
          "key": "gutenberg-76280",
          "id": 76280,
          "source": "gutendex",
          "title": "Mathias Sandorf [1] : Een verijdelde samenzwering; Dokter Antekirrt",
          "author": "Jules Verne",
          "authors": [
            "Jules Verne"
          ],
          "category": "Adventure",
          "subjects": [
            "Betrayal -- Fiction",
            "Retribution -- Fiction"
          ],
          "languages": [
            "nl"
          ],
          "summary": "A Dutch public-domain title by Jules Verne, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/76280/pg76280.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/76280",
          "downloadCount": 4939,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/76280.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-76346",
          "id": 76346,
          "source": "gutendex",
          "title": "Nieuw Utopia",
          "author": "Bernard Alexander Canter",
          "authors": [
            "Bernard Alexander Canter"
          ],
          "category": "Novels",
          "subjects": [
            "Dutch fiction -- 20th century",
            "Speculative fiction"
          ],
          "languages": [
            "nl"
          ],
          "summary": "A Dutch public-domain title by Bernard Alexander Canter, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/76346/pg76346.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/76346",
          "downloadCount": 4768,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/76346.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-76186",
          "id": 76186,
          "source": "gutendex",
          "title": "Lord Lister No. 0032: De blauwe dood",
          "author": "Kurt Matull",
          "authors": [
            "Kurt Matull",
            "Theo von Blankensee"
          ],
          "category": "Crime, Thrillers and Mystery",
          "subjects": [
            "Detective and mystery stories -- Periodicals",
            "Dime novels -- Periodicals"
          ],
          "languages": [
            "nl"
          ],
          "summary": "A Dutch public-domain title by Kurt Matull, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/76186/pg76186.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/76186",
          "downloadCount": 4745,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/76186.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-76187",
          "id": 76187,
          "source": "gutendex",
          "title": "Lord Lister No. 0126: Het politieraadsel",
          "author": "Kurt Matull",
          "authors": [
            "Kurt Matull",
            "Theo von Blankensee"
          ],
          "category": "Adventure",
          "subjects": [
            "Detective and mystery stories -- Periodicals",
            "Dime novels -- Periodicals"
          ],
          "languages": [
            "nl"
          ],
          "summary": "A Dutch public-domain title by Kurt Matull, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/76187/pg76187.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/76187",
          "downloadCount": 4655,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/76187.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-22722",
          "id": 22722,
          "source": "gutendex",
          "title": "Woordenlijst voor de spelling der Nederlandsche Taal: Met aanwijzing van de geslachten der naamwoorden en de vervoeging der werkwoorden",
          "author": "M. de (Matthias) Vries",
          "authors": [
            "M. de (Matthias) Vries",
            "L. A. te Winkel"
          ],
          "category": "Encyclopedias/Dictionaries/Reference",
          "subjects": [
            "Dutch language -- Orthography and spelling"
          ],
          "languages": [
            "nl"
          ],
          "summary": "A Dutch public-domain title by M. de (Matthias) Vries, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/22722/pg22722.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/22722",
          "downloadCount": 4461,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/22722.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-76865",
          "id": 76865,
          "source": "gutendex",
          "title": "Lord Lister No. 0334: Onder de goudzoekers",
          "author": "Kurt Matull",
          "authors": [
            "Kurt Matull",
            "Theo von Blankensee",
            "Felix (Leonard Felix) Hageman"
          ],
          "category": "Adventure",
          "subjects": [
            "Detective and mystery stories -- Periodicals",
            "Dime novels -- Periodicals"
          ],
          "languages": [
            "nl"
          ],
          "summary": "A Dutch public-domain title by Kurt Matull, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/76865/pg76865.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/76865",
          "downloadCount": 4239,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/76865.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-76761",
          "id": 76761,
          "source": "gutendex",
          "title": "Lord Lister No. 0033: De Alarmkreet",
          "author": "Kurt Matull",
          "authors": [
            "Kurt Matull",
            "Theo von Blankensee"
          ],
          "category": "Adventure",
          "subjects": [
            "Detective and mystery stories -- Periodicals",
            "Dime novels -- Periodicals"
          ],
          "languages": [
            "nl"
          ],
          "summary": "A Dutch public-domain title by Kurt Matull, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/76761/pg76761.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/76761",
          "downloadCount": 4179,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/76761.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-76765",
          "id": 76765,
          "source": "gutendex",
          "title": "Lord Lister No. 0333: De liefde van een bokser",
          "author": "Kurt Matull",
          "authors": [
            "Kurt Matull",
            "Theo von Blankensee",
            "Felix (Leonard Felix) Hageman"
          ],
          "category": "Adventure",
          "subjects": [
            "Detective and mystery stories -- Periodicals",
            "Dime novels -- Periodicals"
          ],
          "languages": [
            "nl"
          ],
          "summary": "A Dutch public-domain title by Kurt Matull, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/76765/pg76765.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/76765",
          "downloadCount": 4169,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/76765.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        }
      ]
    },
    "fi": {
      "label": "Finnish",
      "count": 3702,
      "books": [
        {
          "key": "gutenberg-78071",
          "id": 78071,
          "source": "gutendex",
          "title": "Kaksi morsianta : Yksinäytöksinen pila",
          "author": "Kaarlo Hemmo",
          "authors": [
            "Kaarlo Hemmo"
          ],
          "category": "Comedy plays",
          "subjects": [
            "Comedy plays",
            "Finnish drama -- 20th century",
            "One-act plays"
          ],
          "languages": [
            "fi"
          ],
          "summary": "A Finnish public-domain title by Kaarlo Hemmo, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78071/pg78071.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78071",
          "downloadCount": 24413,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78071.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-78058",
          "id": 78058,
          "source": "gutendex",
          "title": "Lintukoto : Muutamia päiväkirjan lehtiä",
          "author": "Joel Lehtonen",
          "authors": [
            "Joel Lehtonen"
          ],
          "category": "Finnish fiction",
          "subjects": [
            "Finnish fiction -- 20th century",
            "Short stories, Finnish"
          ],
          "languages": [
            "fi"
          ],
          "summary": "A Finnish public-domain title by Joel Lehtonen, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78058/pg78058.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78058",
          "downloadCount": 24382,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78058.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-78007",
          "id": 78007,
          "source": "gutendex",
          "title": "Vanhaa viinaa uudessa leilissä : Pakinoita",
          "author": "Tatu Valkonen",
          "authors": [
            "Tatu Valkonen"
          ],
          "category": "Finnish wit and humor",
          "subjects": [
            "Finnish wit and humor"
          ],
          "languages": [
            "fi"
          ],
          "summary": "A Finnish public-domain title by Tatu Valkonen, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78007/pg78007.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78007",
          "downloadCount": 24363,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78007.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-78049",
          "id": 78049,
          "source": "gutendex",
          "title": "Sointula : Kolminäytöksinen näytelmä",
          "author": "Arvid Järnefelt",
          "authors": [
            "Arvid Järnefelt"
          ],
          "category": "Finnish drama",
          "subjects": [
            "Finnish drama -- 20th century"
          ],
          "languages": [
            "fi"
          ],
          "summary": "A Finnish public-domain title by Arvid Järnefelt, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78049/pg78049.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78049",
          "downloadCount": 24342,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78049.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-78018",
          "id": 78018,
          "source": "gutendex",
          "title": "Karavaani ja muita juttuja",
          "author": "Pentti Haanpää",
          "authors": [
            "Pentti Haanpää"
          ],
          "category": "Finnish fiction",
          "subjects": [
            "Finnish fiction -- 20th century",
            "Short stories, Finnish"
          ],
          "languages": [
            "fi"
          ],
          "summary": "A Finnish public-domain title by Pentti Haanpää, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78018/pg78018.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78018",
          "downloadCount": 24316,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78018.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-78097",
          "id": 78097,
          "source": "gutendex",
          "title": "Kevättuulahduksia : Runokokoelma",
          "author": "Niilo Mantere",
          "authors": [
            "Niilo Mantere"
          ],
          "category": "Finnish poetry",
          "subjects": [
            "Finnish poetry -- 19th century"
          ],
          "languages": [
            "fi"
          ],
          "summary": "A Finnish public-domain title by Niilo Mantere, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78097/pg78097.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78097",
          "downloadCount": 24314,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78097.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-78042",
          "id": 78042,
          "source": "gutendex",
          "title": "Ihmisvihaaja : Viisinäytöksinen huvinäytelmä",
          "author": "Molière",
          "authors": [
            "Molière"
          ],
          "category": "Comedy plays",
          "subjects": [
            "Comedy plays",
            "France -- Social life and customs -- 17th century -- Drama",
            "Man-woman relationships -- Drama"
          ],
          "languages": [
            "fi"
          ],
          "summary": "A Finnish public-domain title by Molière, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78042/pg78042.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78042",
          "downloadCount": 24311,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78042.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-78070",
          "id": 78070,
          "source": "gutendex",
          "title": "Velisurmaaja : Kolmenäytöksinen murhenäytelmä",
          "author": "Lauri Haarla",
          "authors": [
            "Lauri Haarla"
          ],
          "category": "Finnish drama",
          "subjects": [
            "Finnish drama -- 20th century",
            "Tragedies (Drama)"
          ],
          "languages": [
            "fi"
          ],
          "summary": "A Finnish public-domain title by Lauri Haarla, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/78070/pg78070.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/78070",
          "downloadCount": 24195,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/78070.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        }
      ]
    },
    "sv": {
      "label": "Swedish",
      "count": 257,
      "books": [
        {
          "key": "gutenberg-65580",
          "id": 65580,
          "source": "gutendex",
          "title": "Carl Svenske: Historisk berättelse från frihetstiden",
          "author": "Gustaf Björlin",
          "authors": [
            "Gustaf Björlin"
          ],
          "category": "Historical Novels",
          "subjects": [
            "Historical fiction",
            "Sweden -- Fiction"
          ],
          "languages": [
            "sv"
          ],
          "summary": "A Swedish public-domain title by Gustaf Björlin, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/65580/pg65580.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/65580",
          "downloadCount": 3458,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/65580.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-74639",
          "id": 74639,
          "source": "gutendex",
          "title": "Fröken Liwin",
          "author": "Marika Stiernstedt",
          "authors": [
            "Marika Stiernstedt"
          ],
          "category": "Foster children",
          "subjects": [
            "Foster children -- Fiction",
            "Mothers and daughters -- Fiction",
            "Swedish fiction -- 20th century",
            "Unmarried mothers -- Fiction"
          ],
          "languages": [
            "sv"
          ],
          "summary": "A Swedish public-domain title by Marika Stiernstedt, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/74639/pg74639.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/74639",
          "downloadCount": 1584,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/74639.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-26479",
          "id": 26479,
          "source": "gutendex",
          "title": "I Utvecklingstid: En berättelse om flickor",
          "author": "Toini Topelius",
          "authors": [
            "Toini Topelius"
          ],
          "category": "Children & Young Adult Reading",
          "subjects": [
            "Girls -- Juvenile fiction",
            "Swedes -- Finland -- Social life and customs -- Juvenile fiction"
          ],
          "languages": [
            "sv"
          ],
          "summary": "A Swedish public-domain title by Toini Topelius, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/26479/pg26479.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/26479",
          "downloadCount": 1516,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/26479.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-62806",
          "id": 62806,
          "source": "gutendex",
          "title": "Kåtornas folk",
          "author": "Ester Blenda Nordström",
          "authors": [
            "Ester Blenda Nordström"
          ],
          "category": "Novels",
          "subjects": [
            "Lapland -- Description and travel",
            "Sami (European people)"
          ],
          "languages": [
            "sv"
          ],
          "summary": "A Swedish public-domain title by Ester Blenda Nordström, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/62806/pg62806.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/62806",
          "downloadCount": 1362,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/62806.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-51613",
          "id": 51613,
          "source": "gutendex",
          "title": "Engelsk-Svensk och Svensk-Engelsk Ordbok Med Fullständig Uttalsbeteckning",
          "author": "Frederick Lönnkvist",
          "authors": [
            "Frederick Lönnkvist"
          ],
          "category": "Encyclopedias/Dictionaries/Reference",
          "subjects": [
            "English language -- Dictionaries -- Swedish",
            "Swedish language -- Dictionaries -- English",
            "Swedish language -- Glossaries, vocabularies, etc."
          ],
          "languages": [
            "sv"
          ],
          "summary": "A Swedish public-domain title by Frederick Lönnkvist, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/51613/pg51613.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/51613",
          "downloadCount": 1360,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/51613.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-48961",
          "id": 48961,
          "source": "gutendex",
          "title": "En piga bland pigor",
          "author": "Ester Blenda Nordström",
          "authors": [
            "Ester Blenda Nordström"
          ],
          "category": "Adventure",
          "subjects": [
            "Farm life -- Sweden",
            "Household employees -- Sweden"
          ],
          "languages": [
            "sv"
          ],
          "summary": "A Swedish public-domain title by Ester Blenda Nordström, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/48961/pg48961.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/48961",
          "downloadCount": 1288,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/48961.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-48964",
          "id": 48964,
          "source": "gutendex",
          "title": "Ett pennskaft som piga",
          "author": "Anton Holtz",
          "authors": [
            "Anton Holtz"
          ],
          "category": "Humour",
          "subjects": [
            "Nordström, Ester Blenda, 1891-1948. En piga bland pigor"
          ],
          "languages": [
            "sv"
          ],
          "summary": "A Swedish public-domain title by Anton Holtz, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/48964/pg48964.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/48964",
          "downloadCount": 1160,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/48964.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-28473",
          "id": 28473,
          "source": "gutendex",
          "title": "Boken om lille-bror: Ett äktenskaps roman",
          "author": "Gustaf af Geijerstam",
          "authors": [
            "Gustaf af Geijerstam"
          ],
          "category": "Novels",
          "subjects": [
            "Domestic fiction",
            "Married people -- Fiction",
            "Sweden -- Fiction"
          ],
          "languages": [
            "sv"
          ],
          "summary": "A Swedish public-domain title by Gustaf af Geijerstam, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/28473/pg28473.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/28473",
          "downloadCount": 1147,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/28473.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        }
      ]
    },
    "la": {
      "label": "Latin",
      "count": 146,
      "books": [
        {
          "key": "gutenberg-218",
          "id": 218,
          "source": "gutendex",
          "title": "C. Iuli Caesaris De Bello Gallico, I-IV",
          "author": "Julius Caesar",
          "authors": [
            "Julius Caesar"
          ],
          "category": "History - Ancient",
          "subjects": [
            "Gaul -- History -- Gallic Wars, 58-51 B.C."
          ],
          "languages": [
            "la"
          ],
          "summary": "A Latin public-domain title by Julius Caesar, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/218/pg218.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/218",
          "downloadCount": 1760,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/218.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-226",
          "id": 226,
          "source": "gutendex",
          "title": "Cicero's Orations",
          "author": "Marcus Tullius Cicero",
          "authors": [
            "Marcus Tullius Cicero"
          ],
          "category": "Essays, Letters & Speeches",
          "subjects": [
            "Rome -- History -- 53-44 B.C. -- Sources",
            "Speeches, addresses, etc., Latin"
          ],
          "languages": [
            "la"
          ],
          "summary": "A Latin public-domain title by Marcus Tullius Cicero, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/226/pg226.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/226",
          "downloadCount": 1337,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/226.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-227",
          "id": 227,
          "source": "gutendex",
          "title": "Aeneidos",
          "author": "Virgil",
          "authors": [
            "Virgil"
          ],
          "category": "Best Books Ever Listings",
          "subjects": [
            "Aeneas (Legendary character) -- Poetry",
            "Epic poetry, Latin",
            "Legends -- Rome -- Poetry"
          ],
          "languages": [
            "la"
          ],
          "summary": "A Latin public-domain title by Virgil, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/227/pg227.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/227",
          "downloadCount": 8361,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/227.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-229",
          "id": 229,
          "source": "gutendex",
          "title": "The Bucolics and Eclogues",
          "author": "Virgil",
          "authors": [
            "Virgil"
          ],
          "category": "Classics of Literature",
          "subjects": [
            "Country life -- Rome -- Poetry",
            "Pastoral poetry, Latin"
          ],
          "languages": [
            "la"
          ],
          "summary": "A Latin public-domain title by Virgil, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/229/pg229.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/229",
          "downloadCount": 1190,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/229.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-231",
          "id": 231,
          "source": "gutendex",
          "title": "Georgicon",
          "author": "Virgil",
          "authors": [
            "Virgil"
          ],
          "category": "Classics of Literature",
          "subjects": [
            "Agriculture -- Poetry",
            "Didactic poetry, Latin"
          ],
          "languages": [
            "la"
          ],
          "summary": "A Latin public-domain title by Virgil, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/231/pg231.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/231",
          "downloadCount": 1228,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/231.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-237",
          "id": 237,
          "source": "gutendex",
          "title": "Sexti Properti Elegiarvm: Liber Primvs",
          "author": "Sextus Propertius",
          "authors": [
            "Sextus Propertius"
          ],
          "category": "Classics of Literature",
          "subjects": [
            "Elegiac poetry, Latin",
            "Latin poetry",
            "Love poetry, Latin",
            "Man-woman relationships -- Poetry"
          ],
          "languages": [
            "la"
          ],
          "summary": "A Latin public-domain title by Sextus Propertius, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/237/pg237.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/237",
          "downloadCount": 664,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/237.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-607",
          "id": 607,
          "source": "gutendex",
          "title": "Die Augsburger Confession",
          "author": "Philipp Melanchthon",
          "authors": [
            "Philipp Melanchthon"
          ],
          "category": "History - Early Modern (c. 1450-1750)",
          "subjects": [
            "Lutheran Church -- Doctrines",
            "Theology, Doctrinal"
          ],
          "languages": [
            "de",
            "la"
          ],
          "summary": "A Latin public-domain title by Philipp Melanchthon, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/607/pg607.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/607",
          "downloadCount": 602,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/607.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        },
        {
          "key": "gutenberg-825",
          "id": 825,
          "source": "gutendex",
          "title": "Latin Vulgate, Bible Book Titles and Names",
          "author": "Anonymous",
          "authors": [
            "Anonymous"
          ],
          "category": "Encyclopedias/Dictionaries/Reference",
          "subjects": [
            "Bible"
          ],
          "languages": [
            "la"
          ],
          "summary": "A Latin public-domain title by Anonymous, available through Project Gutenberg.",
          "coverUrl": "https://www.gutenberg.org/cache/epub/825/pg825.cover.medium.jpg",
          "sourceUrl": "https://www.gutenberg.org/ebooks/825",
          "downloadCount": 681,
          "copyright": false,
          "reader": {
            "engine": "text",
            "sourceUrl": "https://www.gutenberg.org/ebooks/825.txt.utf-8",
            "mimeType": "text/plain; charset=utf-8"
          }
        }
      ]
    }
  };

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
    schemaVersion: 8,
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
    /* Paid premium access per member: an active monthly window, a lifetime
       all-access flag, and lifetime unlocks for individual titles. */
    premiumAccess: {
      "student-maya": { monthlyUntil: null, lifetimeAll: false, books: {} },
      "admin-elena": { monthlyUntil: null, lifetimeAll: false, books: {} }
    },
    /* Local demo order ledger. No real payment is processed. */
    orders: [],
    /* Device sessions used to enforce the two-device limit per account. */
    deviceSessions: {
      "student-maya": [],
      "admin-elena": []
    },
    /* Discount vouchers issued with certificates, keyed by certificate ID. */
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
    STATE_KEY: "scholarscroll-library-v8",
    LEGACY_STATE_KEYS: [
      "scholarscroll-library-v7",
      "scholarscroll-library-v6",
      "lumina-live-library-v5",
      "lumina-library-dashboard-v4",
      "lumina-library-dashboard-v3"
    ],
    SCHEMA_VERSION: 8,
    /* The Python backend is probed at same-origin /api, then at this port. */
    BACKEND_PORT: 8000,
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
    /* Reader motto shown on the dashboard, kept to a short, calm pair. */
    DASHBOARD_QUOTES: [
      {
        text: "One best book is equal to a hundred good friends, but one good friend is equal to a library.",
        author: "A. P. J. Abdul Kalam"
      },
      {
        text: "Arise, awake, and stop not till the goal is reached.",
        author: "Swami Vivekananda"
      }
    ],
    CERTIFICATE_REWARD_DAYS: 7,
    /* Paid premium plans (local demo prices, Indian rupees). */
    PREMIUM_PLANS: [
      {
        id: "monthly",
        name: "Monthly access",
        price: 50,
        scope: "all",
        durationDays: 30,
        tagline: "Every premium book for one month.",
        detail: "One month of unlimited premium reading. Renews only when you choose."
      },
      {
        id: "single",
        name: "Lifetime single book",
        price: 150,
        scope: "book",
        durationDays: null,
        tagline: "Own one premium title for life.",
        detail: "Pick any one readable premium title and keep lifetime access to it."
      },
      {
        id: "lifetime",
        name: "Lifetime all-access",
        price: 1000,
        scope: "all",
        durationDays: null,
        tagline: "Every premium book, forever.",
        detail: "One payment for lifetime access to the entire premium shelf."
      }
    ],
    VOUCHER_PERCENTS: [10, 20, 30, 40, 50],
    VOUCHER_VALID_DAYS: 7,
    MAX_DEVICES: 2,
    PREMIUM_BOOKS: premiumBooks,
    PREMIUM_SPOTLIGHT: premiumSpotlight,
    HINDI_BOOKS: hindiBooks,
    LANGUAGE_SHELVES: languageShelves,
    hindiBooks,
    languageShelves,
    OFFLINE_STARTER_BOOKS: offlineStarterBooks,
    DAY_IN_MS,
    dayKey,
    seedBooks,
    premiumBooks,
    users,
    createInitialState
  });
})();
