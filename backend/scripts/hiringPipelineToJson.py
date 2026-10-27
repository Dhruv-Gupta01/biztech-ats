#!/usr/bin/env python3
# Converts the "Candidate Master" tab of BTA_Coding_Hiring_Pipeline_Master.xlsx
# into Candidate-shaped JSON for scripts/importHiringPipeline.js.
#
# Python (openpyxl) rather than Node on purpose: the backend has no xlsx
# dependency and adding one needs approval. The output contains candidate PII —
# write it OUTSIDE the repo (never commit it).
#
# Usage:
#   python3 -I scripts/hiringPipelineToJson.py "<path>.xlsx" /path/outside/repo/candidates.json
#
# Mapping decisions agreed with the recruiter:
#   - rows with no Primary Email are skipped (email is the ATS dedupe key)
#   - no phone -> "N/A" (phone is required by the schema)
#   - Engagement: blank = Freelance; "Contract / Freelance" (either order) = Freelance/Contract
#   - roleCode is always CODING (this sheet is coding-only); employment type is independent of it
#   - Total YOE ranges -> midpoint (3-5 -> 4, 5-7 -> 6, 7-10 -> 8.5, 10+ -> 10); blank -> 0
#   - Calendly link sent = Invite Sent Via (link owner) has a value (or a slot is booked); "booked" = Slot Booked is Yes
#   - project = Prolific when IDV has a value; project status from IDV (DONE=Complete, PENDING=In Pipeline, BANNED/DISQUALIFIED=Banned / Disqualified)
#   - ignored: form columns, Client Batch, Existing-Candidate Re-interview, derived/internal
#     columns (Highest Stage*, First/Last Seen, # Source Rows, Found In, In Previous Master?),
#     dirty Fit % / Resume Score and the form-answer columns (Linux, Docker, ...)
# The original Current Status and every non-field column we keep land in generalRemarks,
# so nothing is lost even where the ATS has no dedicated field.

import json
import re
import sys
import warnings

warnings.filterwarnings('ignore')
import openpyxl  # noqa: E402

ROLE_CODE = 'CODING'
SOURCE_FALLBACK = 'Hiring Pipeline Import'

ENGAGEMENT_MAP = {
    'contract': 'Contract',
    'freelance': 'Freelance',
    'contract / freelance': 'Freelance/Contract',
    'freelance / contract': 'Freelance/Contract',
}

YOE_MAP = {'3-5 years': 4, '5-7 years': 6, '7-10 years': 8.5, '10+ years': 10}

# source "Current Status" -> ATS pipeline status
STATUS_MAP = {
    'Form submitted – not screened yet': 'Information Form Response',
    'Profile only (no form)': 'Information Form Response',
    'Relevant – not invited yet': 'Information Form Response',
    'Invited – not booked': 'Interview 1',
    'Booked – no result yet': 'Interview 1',
    'Appeared – result not recorded': 'Interview 1',
    'Did not appear for interview': 'Not Appeared',
    'Re-attempt / rescheduled': 'Rescheduled',
    'Failed screening interview': 'Rejected',
    'Passed screening – paperwork pending': 'Interview 1 Shortlisted',
    'Onboarded – waiting for bootcamp': 'Interview 1 Shortlisted',
    'In / joined bootcamp – no pass recorded': 'Assessment 1',
    'Passed bootcamp – client step pending': 'Assessment 1 Passed',
    'Qualified client assessment': 'Assessment 1 Passed',
    'Failed client assessment': 'Rejected',
    'Banned / disqualified (client)': 'Rejected',
    'Not interested / dropped': 'Not interested',
}

SCREENING_MAP = {
    'Passed': 'Pass',
    'Failed': 'Fail',
    'Did not appear': 'Not Appeared',
    'Re-attempt / rescheduled': 'Rescheduled',
    'Invited – not booked': 'Invited – not booked',
    'Booked – no result yet': 'Booked – no result yet',
    'Appeared – result not recorded': 'Appeared – result not recorded',
}

# Paperwork -> (ndaIca, onboarding, slackStatus)
PAPERWORK_MAP = {
    'Done': ('Signed', 'Done', None),
    'Both pending': ('Not Signed', 'Sent', None),
    'Onboarding form pending': ('Not Signed', 'Sent', None),
    'Not Interested': ('Not Interested', 'Not Interested', None),
    'Joined Slack': (None, None, 'Joined'),
    'Slack pending': (None, None, 'Not Joined'),
}

# IDV value -> ATS project status (Prolific)
IDV_STATUS_MAP = {'DONE': 'Complete', 'PENDING': 'In Pipeline', 'BANNED': 'Banned / Disqualified', 'DISQUALIFIED': 'Banned / Disqualified'}

BOOTCAMP_STATUS_MAP = {'Passed': 'Pass', 'Joined – no pass recorded': 'Active', 'Direct to client (existing / external)': 'Direct to client'}


def text(v):
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def split_list(v):
    return [t.strip() for t in re.split(r'[;,]', text(v)) if t.strip()]


def build(row, ix):
    def g(name):
        return text(row[ix[name]])

    email = g('Primary Email').lower()
    if not email or '@' not in email:
        return None

    engagement = ENGAGEMENT_MAP.get(g('Engagement (from form)').lower(), 'Freelance')
    yoe_raw = g('Total YOE')
    years = YOE_MAP.get(yoe_raw, 0)

    skills, seen = [], set()
    for tok in split_list(row[ix['Strongest Language']]) + split_list(row[ix['Other Languages']]):
        key = tok.lower()
        if key not in seen and len(tok) <= 40:
            seen.add(key)
            skills.append(tok)

    resume = g('Resume Link')
    current_status = g('Current Status')
    slot_booked = g('Slot Booked') == 'Yes'
    # Calendly link sent = "Invite Sent Via (link owner)" has a value (a booked slot also
    # implies the link went out, even where the owner wasn't recorded).
    invite_sent = bool(g('Invite Sent Via (link owner)')) or slot_booked
    idv = g('IDV').upper()

    nda, onboarding, slack = PAPERWORK_MAP.get(g('Paperwork'), (None, None, None))
    if g('Slack') == 'Yes':
        slack = 'Joined'

    screening = SCREENING_MAP.get(g('Screening Interview Result'))
    if g('Not Interested') == 'Yes':
        screening = 'Not interested'

    attempts = g('Bootcamp Attempts')

    # No dedicated ATS field for these — keep them readable in remarks.
    remark_fields = [
        ('Person ID', 'Person ID'), ('Source status', None), ('Total YOE', None),
        ('Other Emails', 'Other Emails'), ('Other Phones', 'Other Phones'),
        ('Invite Sent Via', 'Invite Sent Via (link owner)'), ('Invite Date', 'Invite Date'),
        ('Interviewer', 'Interviewer'), ('Interview Date', 'Interview Date'),
        ('External Assessment Sent', 'External Assessment Sent'),
        ('Round 2 (DSA)', 'Round 2 (DSA) Result'), ('Bootcamp Batch', 'Bootcamp Batch'),
        ('Bootcamp Result', 'Bootcamp Result'), ('IDV', 'IDV'),
        ('Client Assessment', 'Client Assessment Result'), ('Follow-up', 'Follow-up Notes'),
        ('Previous Master ID', 'Previous Master ID'), ('Previous Stage', 'Previous Stage'),
        ('Previous Projects', 'Previous Projects'),
    ]
    remarks = []
    for label, col in remark_fields:
        if label == 'Source status':
            val = current_status
        elif label == 'Total YOE':
            val = yoe_raw if yoe_raw else 'not provided (experience stored as 0)'
        else:
            val = g(col)
        if val:
            remarks.append(f'{label}: {val}')

    doc = {
        'fullName': g('Name'),
        'email': email,
        'phone': g('Phone') or 'N/A',
        'location': g('Location'),
        'roleCode': ROLE_CODE,
        'employmentType': engagement,
        'yearsOfExperience': years,
        'noticePeriod': g('Notice Period') or g('Can Start'),
        'skills': skills[:15],
        'designation': g('Strongest Area'),
        'resumeUrl': resume if resume.startswith('http') else '',
        'source': g('Heard About Us Via') or SOURCE_FALLBACK,
        'status': STATUS_MAP.get(current_status, 'Information Form Response'),
        'cvScreening': 'Selected' if g('Resume Relevant?') == 'Yes' else 'Not Set',
        'screeningInterview': screening,
        'calendlyLinkSent': 'Sent' if invite_sent else 'Not Sent',
        'calendlyLinkStatus': 'Booked' if slot_booked else ('Not Booked' if invite_sent else None),
        # IDV filled in = Prolific project; the IDV value is that project's status.
        'project': 'Prolific' if idv else None,
        'projectStatus': IDV_STATUS_MAP.get(idv) if idv else None,
        'ndaIca': nda,
        'slackStatus': slack,
        'bootcampAttempts': f'Attempt {attempts}' if attempts in ('1', '2', '3') else None,
        'bootcampStatus': BOOTCAMP_STATUS_MAP.get(g('Bootcamp Result')),
        'onboarding': onboarding,
        'generalRemarks': '\n'.join(remarks),
    }
    return doc, current_status


def main(src, dest):
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    rows = list(wb['Candidate Master'].iter_rows(values_only=True))
    ix = {name: i for i, name in enumerate(rows[0])}
    docs, skipped_no_email, unmapped = [], 0, {}
    seen_emails = set()
    for row in rows[1:]:
        if not any(c is not None for c in row):
            continue
        built = build(row, ix)
        if built is None:
            skipped_no_email += 1
            continue
        doc, current_status = built
        if doc['email'] in seen_emails:
            continue
        seen_emails.add(doc['email'])
        if current_status not in STATUS_MAP:
            unmapped[current_status] = unmapped.get(current_status, 0) + 1
        docs.append(doc)
    with open(dest, 'w') as f:
        json.dump(docs, f)
    print(f'wrote {len(docs)} candidates to {dest}')
    print(f'skipped (no usable email): {skipped_no_email}')
    print(f'unmapped Current Status values (defaulted to Information Form Response): {unmapped or "none"}')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
