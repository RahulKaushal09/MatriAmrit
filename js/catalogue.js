/* =====================================================================
   MatriAmrit - product catalogue (frontend copy)

   Images, long-form copy and everything a product page needs to render
   without a network call. Prices here are for DISPLAY ONLY - the server
   re-prices every order from backend/src/data/catalogue.js and that is
   the number actually charged. If you change a price, change both, then
   run `cd backend && npm run check:catalogue`.

   Ingredient notes are deliberately careful - "traditionally valued
   for", not "cures". This is food for children, elders and new mothers;
   the wording is a decision, not a placeholder. Please keep it.
   ===================================================================== */
(() => {
  'use strict';

  const PRODUCTS = [
    {
      id: 'oorja-shakti-laddu',
      name: 'Oorja Shakti Laddu',
      devanagari: 'ऊर्जा शक्ति लड्डू',
      subtitle: 'Traditional Strength & Nourishment Laddu',
      tagline: 'Bala Poshanam · For Every Generation',
      badge: 'For everyone',
      audience: 'For growing children and senior members of the family.',
      image: 'assets/img/products/productGondLaddu.png',
      imageAlt: 'MatriAmrit Oorja Shakti Laddu - traditional laddus in a brass bowl',
      mediaBackground: 'linear-gradient(150deg,#F0E4CB,#D8BE8F)',
      ratePerKg: 1450,
      summary:
        'A wholesome blend of grains, nuts, seeds, and dry fruits, thoughtfully prepared for <strong>growing children and senior members of the family</strong>.',
      story:
        'Nineteen ingredients, each one chosen the way it has always been chosen in an Indian kitchen - grains for the base, ghee for richness, seeds and dry fruits folded through. Nothing is added for shelf life, and nothing is left out to save time.',

      benefits: [
        'Grains, nuts, seeds & dry fruits',
        'Traditional everyday nourishment',
        'For growing children & elders',
        'Sweetened with organic khand',
      ],
      tags: ['Bala Poshanam', '19 traditional ingredients', 'No refined sugar'],

      ingredientsHeading: 'Ingredients & Their Goodness',
      ingredients: [
        { name: 'Organic Wheat Flour', deva: 'गेहूँ का आटा', note: 'A wholesome traditional grain base that provides energy.' },
        { name: 'Organic Khand', deva: 'खांड', note: 'A traditional sweetening ingredient.' },
        { name: 'Organic Gond', deva: 'गोंद', note: 'Traditionally used in nourishing preparations.' },
        { name: 'Pure Cow Ghee', deva: 'शुद्ध गौ घृत', note: 'Adds richness and traditional nourishment.' },
        { name: 'Flax Seeds / Alsi', deva: 'अलसी', note: 'A natural source of healthy fats and fibre.' },
        { name: 'Sesame Seeds / Til', deva: 'तिल', note: 'Traditionally valued for nourishment and strength.' },
        { name: 'Poppy Seeds / Khus Khus', deva: 'खसखस', note: 'Adds richness and texture to traditional preparations.' },
        { name: 'Walnuts / Akhrot', deva: 'अखरोट', note: 'A wholesome source of healthy fats.' },
        { name: 'Almonds / Badam', deva: 'बादाम', note: 'Traditionally valued for nourishment.' },
        { name: 'Cashews / Kaju', deva: 'काजू', note: 'Adds richness and natural energy.' },
        { name: 'Raisins / Kishmish', deva: 'किशमिश', note: 'Adds natural sweetness and wholesome goodness.' },
        { name: 'Figs / Anjeer', deva: 'अंजीर', note: 'A naturally sweet and fibre-rich dry fruit.' },
        { name: 'Dates / Khajur', deva: 'खजूर', note: 'Provides natural sweetness and energy.' },
        { name: 'Makhana', deva: 'मखाना', note: 'A light and wholesome traditional ingredient.' },
        { name: 'Dry Coconut / Nariyal Giri', deva: 'नारियल गिरी', note: 'Adds healthy richness and flavour.' },
        { name: 'Chironji / Chara', deva: 'चिरौंजी', note: 'A traditional nutty ingredient used in Indian nourishment.' },
        { name: 'Sunflower Seeds', deva: 'सूरजमुखी के बीज', note: 'Adds natural plant-based goodness.' },
        { name: 'Melon Seeds', deva: 'खरबूजे के बीज', note: 'Traditionally used in nourishing seed blends.' },
        { name: 'Magaz Seeds', deva: 'मगज के बीज', note: 'Adds richness and wholesome nourishment.' },
      ],

      parampara: {
        title: 'Bala Poshanam with Parampara',
        lotus: '🪷',
        body:
          'A thoughtful combination of traditional ingredients prepared to bring together <em>Poshanam (पोषणम्), Bala (बल), and Shuddhata (शुद्धता)</em>.',
        mantra: 'बलम् • पोषणम् • शुद्धता • सेवा',
        closing: 'Wholesome traditional nourishment for every generation.',
      },

      howToUse: [
        'One laddu in the morning, ideally with warm milk.',
        'Best from October through February, when the body takes to it most easily.',
        'Children above five: half a laddu a day.',
      ],
      storage:
        'Store in an airtight container in a cool, dry place away from sunlight. No refrigeration needed. Best consumed within 30 days of the date on the pack.',
      allergens:
        'Contains wheat, milk (cow ghee), tree nuts (almond, cashew, walnut, chironji), sesame, poppy, sunflower, melon and magaz seeds, and coconut. Made in a kitchen that also handles groundnut.',

      variants: [
        { id: 'oorja-1kg', label: '1 kg', grams: 1000, price: 1450, note: 'About 24 laddus · roughly a month', popular: true },
        { id: 'oorja-2kg', label: '2 kg', grams: 2000, price: 2900, note: 'About 48 laddus · for a whole household' },
      ],

      faqs: [
        {
          q: 'Who is this laddu meant for?',
          a: 'Growing children and senior members of the family, and adults who want something wholesome through the winter. It is an everyday food, not a treatment for anything.',
        },
        {
          q: 'Is there any refined sugar?',
          a: 'None. The only sweetener is organic khand, along with the natural sweetness of dates, figs and raisins. If you are managing diabetes, please speak to your doctor first.',
        },
        {
          q: 'Can I eat this during pregnancy?',
          a: 'Gond-based laddus are traditionally given in the third trimester and after delivery, not early in pregnancy. Please ask your doctor first, and message us - we will tell you honestly whether to wait.',
        },
        {
          q: 'How long do they keep?',
          a: 'Thirty days from the date printed on the pack, stored airtight and away from heat. We make to order, so what reaches you is rarely more than a few days old.',
        },
      ],
    },

    {
      id: 'matra-shakti-laddu',
      name: 'Matra Shakti Laddu',
      devanagari: 'मातृ शक्ति लड्डू',
      subtitle: 'Sutika Poshanam · Traditional Postpartum Nourishment',
      tagline: 'For Mothers · The Sutika Period',
      badge: 'For new mothers',
      audience: 'Traditional postpartum nourishment for new mothers.',
      image: 'assets/img/products/productpostdeliveryLaddu.png',
      imageAlt: 'MatriAmrit Matra Shakti Laddu - Ayurvedic laddus in a brass bowl with almonds',
      mediaBackground: 'linear-gradient(150deg,#F6DCD3,#E0A98F)',
      ratePerKg: 1650,
      summary:
        'A thoughtfully crafted blend inspired by traditional <strong>Sutika Ahara</strong>, created to nourish and support mothers during their postpartum journey.',
      story:
        'In the sutika kala - the forty days after birth - Ayurveda asks for food that is warm, unctuous and easy to digest, because the mother\'s agni is at its lowest and her body is rebuilding. This laddu is that instruction, made edible.',

      benefits: [
        'Inspired by traditional Sutika Ahara',
        'Shatavari, methi & ajwain',
        'Ragi and desi gud base',
        'Made in small batches, to order',
      ],
      tags: ['Sutika Poshanam', 'Shatavari & methi', 'Desi gud, no refined sugar'],

      ingredientsHeading: 'Ingredients & Traditional Purpose',
      ingredients: [
        { name: 'Shatavari', deva: 'शतावरी', note: "Traditionally valued for women's wellness and lactation support." },
        { name: 'Kalonji', deva: 'कलौंजी', note: 'Traditionally used for overall nourishment and wellness.' },
        { name: 'Kacchi Haldi / Fresh Turmeric', deva: 'कच्ची हल्दी', note: 'Traditionally included in postpartum foods for recovery and warmth.' },
        { name: 'Methi / Fenugreek', deva: 'मेथी', note: 'Traditionally used in postpartum and lactation preparations.' },
        { name: 'Ajwain / Carom Seeds', deva: 'अजवाइन', note: 'Traditionally included in postpartum diets for digestive comfort.' },
        { name: 'Organic Ragi Flour', deva: 'रागी आटा', note: 'A wholesome grain traditionally valued for nourishment and strength.' },
        { name: 'Desi Gud / Jaggery', deva: 'देसी गुड़', note: 'Adds natural sweetness and traditional nourishment.' },
        { name: 'Mahua', deva: 'महुआ', note: 'A traditional ingredient valued in regional food practices.' },
        { name: 'Premium Dry Fruits', deva: 'मेवे', note: 'Add richness, energy, and wholesome nourishment.' },
      ],

      parampara: {
        title: 'Poshanam with Parampara',
        lotus: '🪷',
        body:
          'A mindful blend of traditional herbs, grains, and dry fruits, prepared with <em>Shraddha (श्रद्धा), Shuddhata (शुद्धता), and Seva (सेवा)</em>.',
        mantra: 'मातृ पोषणम् • परम्परा • शुद्धता • सेवा',
        closing: 'Traditional nourishment for the sacred journey of motherhood.',
      },

      howToUse: [
        'One laddu each morning through the sutika period, with warm milk or warm water.',
        'Begin from the seventh day after delivery, or when your doctor clears solid nourishing food.',
        'Continue for six to eight weeks, or as your vaidya advises.',
      ],
      storage:
        'Store in an airtight container in a cool, dry place away from sunlight. No refrigeration needed. Best consumed within 30 days of the date on the pack.',
      allergens:
        'Contains tree nuts (mixed dry fruits) and ragi. Made in a kitchen that also handles milk, wheat, sesame, poppy and groundnut.',

      variants: [
        { id: 'matra-1kg', label: '1 kg', grams: 1000, price: 1650, note: 'About 24 laddus · roughly a month', popular: true },
        { id: 'matra-2kg', label: '2 kg', grams: 2000, price: 3300, note: 'The full sutika period, with some spare' },
      ],

      faqs: [
        {
          q: 'When should I start after delivery?',
          a: 'Most mothers begin around day seven, once digestion has settled. After a caesarean, wait until your doctor clears rich food. Message us with your date and we will guide you.',
        },
        {
          q: 'Is it safe while breastfeeding?',
          a: 'It is made for exactly that period, and shatavari and methi have long been part of postpartum food traditions. It is a food, not a medicine - if you are on any medication, please check with your doctor first.',
        },
        {
          q: 'How much do I need for the full sutika period?',
          a: 'One laddu a day for six weeks is a little under 2 kg. Most mothers order one pack first, see how they take to it, then reorder.',
        },
        {
          q: 'Why is there no refined sugar?',
          a: 'Desi gud is what the tradition asks for, and it carries the warmth that the sutika period is built around. Nothing refined goes in.',
        },
      ],
    },
  ];

  const byId = new Map(PRODUCTS.map(p => [p.id, p]));

  /* ── Money helpers, shared by every page ────────────────────────── */

  const formatPaise = paise => {
    const rupees = paise / 100;
    return `₹${rupees.toLocaleString('en-IN', {
      minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatRupees = rupees => formatPaise(Math.round(rupees * 100));

  window.MATRIAMRIT_CATALOGUE = {
    products: PRODUCTS,
    getProduct: id => byId.get(id) || null,
    getVariant: (productId, variantId) => {
      const product = byId.get(productId);
      if (!product) return null;
      return product.variants.find(v => v.id === variantId) || null;
    },
    formatPaise,
    formatRupees,
    /* Delivery is included in the pack price and is never shown as a
       separate line. Kept at zero so it agrees with the server, which
       the catalogue drift check verifies. */
    delivery: { feePaise: 0, freeAbovePaise: 0 },
  };
})();
