-- BDHS International Applications — D1 schema

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  submitted_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'New',

  contact_email TEXT,

  student_last_name TEXT,
  student_first_name TEXT,
  student_middle_name TEXT,
  student_preferred_name TEXT,
  date_of_birth TEXT,
  place_of_birth TEXT,
  student_email TEXT,
  gender TEXT,

  applying_for_grade TEXT,
  intended_start_term TEXT,
  intends_to_graduate INTEGER DEFAULT 0,
  planned_duration TEXT,

  primary_language TEXT,
  religion TEXT,
  interests TEXT,          -- JSON array as TEXT
  interests_other TEXT,
  sports TEXT,             -- JSON array as TEXT
  sports_other TEXT,

  current_grade TEXT,
  current_school_name TEXT,
  current_school_address TEXT,
  current_school_grades TEXT,
  prior_school_name TEXT,
  prior_school_address TEXT,
  prior_school_grades TEXT,

  disciplinary_action TEXT,
  disciplinary_explanation TEXT,

  home_address TEXT,
  parents_are TEXT,

  father_last_name TEXT,
  father_first_name TEXT,
  father_preferred_name TEXT,
  father_phone TEXT,
  father_email TEXT,
  father_company TEXT,
  father_title TEXT,

  mother_last_name TEXT,
  mother_first_name TEXT,
  mother_preferred_name TEXT,
  mother_phone TEXT,
  mother_email TEXT,
  mother_company TEXT,
  mother_title TEXT,

  siblings TEXT,           -- JSON array as TEXT
  family_language TEXT,

  q_interesting TEXT,
  q_reading TEXT,
  q_contribution TEXT,
  q_influence TEXT,
  q_difficult_decisions TEXT,
  q_generational_challenge TEXT,

  financial_responsibility TEXT,
  i20_email TEXT,

  parent_signature TEXT,
  student_signature TEXT,

  admin_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_applications_submitted_at ON applications(submitted_at);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_intended_term ON applications(intended_start_term);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  original_name TEXT,
  content_type TEXT,
  size INTEGER,
  key TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  FOREIGN KEY (application_id) REFERENCES applications(id)
);

CREATE INDEX IF NOT EXISTS idx_documents_app_id ON documents(application_id);
