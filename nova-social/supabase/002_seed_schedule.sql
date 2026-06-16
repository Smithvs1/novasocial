-- Weekly tone schedule for NOVA Collective social content
-- day_of_week: 0=Monday, 1=Tuesday, 2=Wednesday, 3=Thursday, 4=Friday, 5=Saturday, 6=Sunday
-- focus_type:  N=Neutral (all pros), C=Community-Forward (diverse/women entrepreneurs), A=Any

TRUNCATE TABLE nc_day_schedule;

INSERT INTO nc_day_schedule (day_of_week, post_type, focus_type) VALUES
-- Monday
(0, 'REEL',     'N'),
(0, 'STATIC',   'C'),
(0, 'CAROUSEL', 'N'),

-- Tuesday
(1, 'REEL',     'C'),
(1, 'STATIC',   'N'),
(1, 'CAROUSEL', 'A'),

-- Wednesday
(2, 'REEL',     'N'),
(2, 'STATIC',   'A'),
(2, 'CAROUSEL', 'C'),

-- Thursday
(3, 'REEL',     'C'),
(3, 'STATIC',   'N'),
(3, 'CAROUSEL', 'N'),

-- Friday
(4, 'REEL',     'A'),
(4, 'STATIC',   'C'),
(4, 'CAROUSEL', 'A'),

-- Saturday
(5, 'REEL',     'N'),
(5, 'STATIC',   'A'),
(5, 'CAROUSEL', 'C'),

-- Sunday
(6, 'REEL',     'A'),
(6, 'STATIC',   'N'),
(6, 'CAROUSEL', 'N');
