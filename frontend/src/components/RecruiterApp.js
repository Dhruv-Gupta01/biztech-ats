import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import Footer from './Footer';
import Dashboard from './Dashboard';
import CandidatePool from './CandidatePool';
import SkillSearch from './SkillSearch';
import AssessmentOutreach from './AssessmentOutreach';
import CandidateForm from './CandidateForm';
import RolesCodes from './RolesCodes';
import SlackGroups from './SlackGroups';
import ImportReview from './ImportReview';
import GoogleForms from './GoogleForms';
import RoleCodeData from './RoleCodeData';

// Recruiters get the Manual/Referral source picker on the Application Form tab;
// the candidate-facing form (CandidateDashboard.js) renders CandidateForm directly
// without this flag, so candidates never see or set it.
function RecruiterApplicationForm() {
  return <CandidateForm allowManualSource />;
}

const views = {
  dashboard: Dashboard,
  pool: CandidatePool,
  skills: SkillSearch,
  outreach: AssessmentOutreach,
  apply: RecruiterApplicationForm,
  import: ImportReview,
  roles: RolesCodes,
  slack: SlackGroups,
  forms: GoogleForms,
  roleCodeData: RoleCodeData
};

// The full 7-tab dashboard shown only after a recruiter logs in.
function RecruiterApp() {
  const [view, setView] = useState('dashboard');
  const ActiveView = views[view] || Dashboard;

  return (
    <div className="shell">
      <Sidebar view={view} setView={setView} />
      <div className="main-col">
        <Header setView={setView} />
        <div className="content">
          <ActiveView />
        </div>
        <Footer />
      </div>
    </div>
  );
}

export default RecruiterApp;