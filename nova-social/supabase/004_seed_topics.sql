-- NOVA Collective Social Content — 90-Day Topic Bank
-- 30 REEL + 30 STATIC + 30 CAROUSEL topics
-- Each topic targets a specific beauty/wellness profession
-- focus_type per day_slot follows the weekly schedule pattern:
--   REEL:     N,C,N,C,A,N,A  repeating across 30 days
--   STATIC:   C,N,A,N,C,A,N  repeating
--   CAROUSEL: N,A,C,N,A,C,N  repeating

TRUNCATE TABLE nc_topics CASCADE;

-- ============================================================
-- REEL TOPICS (30)
-- day_slot focus pattern: 1=N 2=C 3=N 4=C 5=A 6=N 7=A 8=N 9=C 10=N ...
-- ============================================================
INSERT INTO nc_topics (post_type, focus_type, day_slot, topic, notes) VALUES
('REEL','N', 1,  'Why the Best Hairstylists Are Leaving Salon Chairs for Their Own Suites',  'Hairstylist — independence from booth rental'),
('REEL','C', 2,  'The Immigrant Nail Tech Who Built a Six-Figure Business in Her Own Suite',  'Nail tech — immigrant entrepreneur story'),
('REEL','N', 3,  'Barbers: Stop Splitting Your Profits — Own the Chair and the Business',     'Barber — financial independence'),
('REEL','C', 4,  'Black Women Estheticians Are Rewriting the Rules of Skincare',              'Esthetician — representation in skincare'),
('REEL','A', 5,  'How Massage Therapists Are Doubling Their Income by Going Solo',            'Massage therapist — income growth'),
('REEL','N', 6,  'The Lash Tech''s Guide to Building a Fully Booked Business',                'Lash tech — client retention and booking'),
('REEL','A', 7,  'Tattoo Artists: Your Art Deserves Its Own Studio',                           'Tattoo artist — creative autonomy'),
('REEL','N', 8,  'How to Set Your Own Prices When You Own Your Suite',                         'All pros — pricing strategy'),
('REEL','C', 9,  'First-Gen Beauty Entrepreneurs: You Are the Blueprint',                      'All pros — first-gen empowerment'),
('REEL','N', 10, 'The Esthetician''s Roadmap to a Private Treatment Room',                     'Esthetician — transition to private practice'),
('REEL','C', 11, 'Women of Color in Beauty: From Employee to Empire Builder',                  'All pros — WOC entrepreneurship'),
('REEL','A', 12, 'Reiki Practitioners: Why a Dedicated Healing Space Changes Everything',      'Reiki — dedicated treatment space'),
('REEL','N', 13, 'The Business Mistake 90% of Hairstylists Make Before Going Independent',    'Hairstylist — common pitfalls'),
('REEL','A', 14, 'Why Your Clients Follow YOU Not the Salon — Make It Official',              'All pros — client loyalty = business'),
('REEL','N', 15, 'Brow and Lash Techs: How to Create an Appointment-Only Experience',         'Brow/lash tech — premium positioning'),
('REEL','C', 16, 'Breaking Barriers: Diverse Barbers Building Their Own Legacy',               'Barber — diverse representation'),
('REEL','N', 17, 'The Nail Tech Who Went From a Table to Her Own Luxury Studio',               'Nail tech — growth story'),
('REEL','C', 18, 'Latina Makeup Artists Are Dominating the Beauty Business',                   'Makeup artist — Latina entrepreneur celebration'),
('REEL','A', 19, 'How to Keep 100% of Your Tips When You Work for Yourself',                  'All pros — financial ownership'),
('REEL','N', 20, 'Waxing Specialists: Your Clients Deserve a Private Suite Experience',        'Waxing specialist — privacy and luxury'),
('REEL','A', 21, 'What Nobody Tells You About Transitioning from Employee to Suite Owner',    'All pros — honest transition advice'),
('REEL','N', 22, 'The Morning Routine of a Six-Figure Suite Owner',                            'All pros — success habits'),
('REEL','C', 23, 'First-Gen Estheticians: Your Parents'' Sacrifice Built This Dream',          'Esthetician — first-gen pride'),
('REEL','N', 24, 'Massage Therapists: Stop Undercharging for Your Healing Gift',               'Massage therapist — value and pricing'),
('REEL','C', 25, 'When They Said the Beauty Industry Has a Ceiling — Prove Them Wrong',       'All pros — barrier-breaking'),
('REEL','A', 26, 'How to Build a Waitlist Before You Even Open Your Suite Doors',             'All pros — pre-marketing strategy'),
('REEL','N', 27, 'Tattoo Artists: From Shared Station to Private Studio — The Playbook',       'Tattoo artist — studio transition'),
('REEL','A', 28, 'The One Investment That Changes Everything for Beauty Professionals',        'All pros — investing in your own space'),
('REEL','N', 29, 'Hairstylists: Your Talent Is the Business — Your Suite Is the Foundation',   'Hairstylist — empowerment'),
('REEL','C', 30, 'Diverse Beauty Pros: This Collective Was Built for You',                     'All pros — NOVA Collective community');

-- ============================================================
-- STATIC TOPICS (30)
-- day_slot focus pattern: 1=C 2=N 3=A 4=N 5=C 6=A 7=N 8=C 9=N 10=A ...
-- ============================================================
INSERT INTO nc_topics (post_type, focus_type, day_slot, topic, notes) VALUES
('STATIC','C', 1,  'Your Craft Was Never Meant to Make Someone Else Rich',                     'All pros — empowerment quote'),
('STATIC','N', 2,  'A Hairstylist''s Income Has No Ceiling When They Own the Room',              'Hairstylist — income potential'),
('STATIC','A', 3,  'Your Name on the Door Hits Different',                                      'All pros — ownership pride'),
('STATIC','N', 4,  'Barbers: Your Clients Come for YOU — Give Them an Experience to Match',     'Barber — client experience upgrade'),
('STATIC','C', 5,  'She Came From Nothing and Built a Beauty Empire — So Can You',              'All pros — rags to riches empowerment'),
('STATIC','A', 6,  'Nail Tech Math: Your Own Suite = 100% of Your Revenue',                     'Nail tech — financial reality'),
('STATIC','N', 7,  'The Difference Between Renting a Chair and Owning Your Business',           'All pros — ownership vs. rental'),
('STATIC','C', 8,  'Immigrant Estheticians Are Quietly Building the Future of Skincare',        'Esthetician — immigrant success'),
('STATIC','N', 9,  'Your Massage Clients Deserve a Private Luxury Experience',                  'Massage therapist — premium experience'),
('STATIC','A', 10, 'Stop Asking Permission to Build Your Dream',                                'All pros — motivational'),
('STATIC','C', 11, 'Lash Queens Don''t Need Anybody''s Approval to Build an Empire',              'Lash tech — fierce independence'),
('STATIC','N', 12, 'A Tattoo Artist''s Studio Should Match Their Art: Bold, Custom, Unapologetic', 'Tattoo artist — aesthetic space'),
('STATIC','A', 13, 'Membership. Not a Lease. That''s the NOVA Difference.',                      'All pros — brand messaging'),
('STATIC','N', 14, 'How Brow Techs Are Turning Micro-Services Into Macro-Revenue',              'Brow tech — business scaling'),
('STATIC','C', 15, 'Black Barbers Built an Industry — Now It''s Time to Own the Space',          'Barber — Black excellence'),
('STATIC','A', 16, 'Your Clients Don''t Care About the Salon Name — They Care About YOU',        'All pros — personal brand'),
('STATIC','N', 17, 'The Waxing Suite That Changed Her Whole Business',                           'Waxing specialist — transformation'),
('STATIC','C', 18, 'First-Gen Beauty Boss: Your Story Is Your Superpower',                       'All pros — first-gen narrative'),
('STATIC','A', 19, 'Reiki Healers: Your Energy Deserves a Sacred Space',                         'Reiki — dedicated space'),
('STATIC','N', 20, 'The #1 Reason Top Makeup Artists Are Moving to Private Suites',              'Makeup artist — industry trend'),
('STATIC','A', 21, 'Your Craft. Your Space. Your Rules.',                                        'All pros — core brand quote'),
('STATIC','N', 22, 'Estheticians: Private Means Premium and Premium Means Profit',               'Esthetician — premium positioning'),
('STATIC','C', 23, 'When Nobody in Your Family Has Owned a Business Before — You Go First',     'All pros — first-gen trailblazing'),
('STATIC','N', 24, 'Nail Techs: Your Art Deserves a Gallery Not a Corner Table',                 'Nail tech — space upgrade'),
('STATIC','C', 25, 'She Didn''t Wait for a Seat at the Table — She Built Her Own',               'All pros — women empowerment'),
('STATIC','A', 26, 'From Booth Renter to Business Owner: It Starts with One Decision',          'All pros — transition mindset'),
('STATIC','N', 27, 'Massage Therapists Are the Most Undervalued Entrepreneurs in Wellness',     'Massage therapist — recognition'),
('STATIC','C', 28, 'Diverse Beauty Professionals Are the Backbone of This Industry',             'All pros — industry contribution'),
('STATIC','N', 29, 'Your 2026 Goal: Own the Suite. Own the Schedule. Own the Income.',           'All pros — goal-setting'),
('STATIC','A', 30, 'The Collective Is Coming — Be a Founding Member',                            'All pros — founding member CTA');

-- ============================================================
-- CAROUSEL TOPICS (30)
-- day_slot focus pattern: 1=N 2=A 3=C 4=N 5=A 6=C 7=N 8=N 9=A 10=C ...
-- ============================================================
INSERT INTO nc_topics (post_type, focus_type, day_slot, topic, notes) VALUES
('CAROUSEL','N', 1,  '6 Signs You Are Ready to Leave the Salon and Go Solo',                    'All pros — readiness checklist'),
('CAROUSEL','A', 2,  'What Is Inside a NOVA Collective Membership (It Is Not a Lease)',         'All pros — membership breakdown'),
('CAROUSEL','C', 3,  'How Diverse Hairstylists Are Building Independent Empires',               'Hairstylist — diverse entrepreneurship'),
('CAROUSEL','N', 4,  'The Barber''s Roadmap: From Booth Renter to Suite Owner in 6 Steps',      'Barber — transition roadmap'),
('CAROUSEL','A', 5,  'How to Price Your Services When You Own Your Space',                       'All pros — pricing guide'),
('CAROUSEL','C', 6,  'Immigrant Beauty Professionals: Your Journey to Suite Ownership',          'All pros — immigrant entrepreneur guide'),
('CAROUSEL','N', 7,  'The Esthetician''s Guide to Creating a Luxury Treatment Suite',             'Esthetician — suite design'),
('CAROUSEL','N', 8,  'How Nail Techs Are Designing Dream Studios on Any Budget',                 'Nail tech — studio setup'),
('CAROUSEL','A', 9,  'The 6 Biggest Financial Mistakes Beauty Pros Make Going Independent',     'All pros — financial pitfalls'),
('CAROUSEL','C', 10, 'First-Gen Massage Therapists: Building a Healing Practice From Scratch',  'Massage therapist — first-gen guide'),
('CAROUSEL','N', 11, 'How Lash Techs Create an Appointment-Only Luxury Experience',              'Lash tech — premium service model'),
('CAROUSEL','A', 12, 'The Tattoo Artist''s Roadmap to a Private Studio',                         'Tattoo artist — studio independence'),
('CAROUSEL','C', 13, 'Women of Color in Wellness: Owning the Space You Heal In',                'All wellness pros — WOC empowerment'),
('CAROUSEL','N', 14, 'How to Build a Client Waitlist Before Your Suite Even Opens',              'All pros — pre-launch strategy'),
('CAROUSEL','A', 15, 'Membership vs. Lease: Why NOVA Collective Does It Differently',           'All pros — membership advantages'),
('CAROUSEL','C', 16, 'Latina Nail Artists: From Kitchen Table to Luxury Studio',                 'Nail tech — Latina entrepreneur journey'),
('CAROUSEL','N', 17, 'The Brow and Lash Tech''s Guide to Doubling Revenue in a Private Suite',   'Brow/lash tech — revenue growth'),
('CAROUSEL','A', 18, '6 Things to Look for in a Salon Suite Membership',                         'All pros — membership evaluation'),
('CAROUSEL','C', 19, 'How Black Estheticians Are Leading the Clean Beauty Revolution',           'Esthetician — Black excellence in skincare'),
('CAROUSEL','N', 20, 'How Makeup Artists Build a Six-Figure Mobile and Suite Business',          'Makeup artist — business model'),
('CAROUSEL','A', 21, 'The True Cost of Booth Rental vs. Suite Membership — A Real Breakdown',   'All pros — cost comparison'),
('CAROUSEL','C', 22, 'Diverse Barbers: From the Neighborhood Chair to Your Own Empire',          'Barber — community to business'),
('CAROUSEL','N', 23, 'Waxing Specialists: How to Create a Private Premium Experience',           'Waxing specialist — service upgrade'),
('CAROUSEL','A', 24, 'How to Market Yourself as an Independent Beauty Professional',             'All pros — marketing guide'),
('CAROUSEL','C', 25, 'First-Gen Hairstylists: Your Family''s Sacrifice Led to Your Suite',       'Hairstylist — first-gen pride'),
('CAROUSEL','N', 26, 'The Reiki Practitioner''s Guide to a Dedicated Healing Studio',             'Reiki — studio setup'),
('CAROUSEL','A', 27, '6 Reasons Your Clients Prefer a Private Suite Experience',                  'All pros — client preference'),
('CAROUSEL','C', 28, 'Immigrant Beauty Pros Built This Industry — Now Own a Piece of It',        'All pros — immigrant pride'),
('CAROUSEL','N', 29, 'How to Transition Your Existing Clients When You Move to a Suite',         'All pros — client transition guide'),
('CAROUSEL','A', 30, 'The Founding Member Advantage: Why Early NOVA Collective Members Win',     'All pros — founding member benefits');
