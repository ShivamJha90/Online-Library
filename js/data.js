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
    hindiBooks,
    OFFLINE_STARTER_BOOKS: offlineStarterBooks,
    DAY_IN_MS,
    dayKey,
    seedBooks,
    premiumBooks,
    users,
    createInitialState
  });
})();
