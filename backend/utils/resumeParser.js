const pdfParse = require('pdf-parse');
const { SKILL_KEYWORDS } = require('../utils/skillKeywords');

function extractEmail(text) {
  const match = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return match ? match[0] : '';
}

function extractPhone(text) {
  const match = text.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3,5}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/);
  return match ? match[0].replace(/\s+/g, ' ').trim() : '';
}

function extractName(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 6)) {
    if (/[@]/.test(line)) continue;
    if (/\d{5,}/.test(line)) continue;
    if (/https?:\/\//i.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && /^[A-Za-z.\s'-]+$/.test(line)) {
      return line;
    }
  }
  return '';
}

function extractSkills(text) {
  const lower = text.toLowerCase();
  return SKILL_KEYWORDS.filter((skill) => lower.includes(skill.toLowerCase()));
}

function extractLocation(text) {
  const locationPatterns = [
    /(?:Location|Address|Based in|City)[\s:]+([A-Za-z\s,]+)/i,
    /(?:Bangalore|Bengaluru|Mumbai|Delhi|Pune|Hyderabad|Chennai|Kolkata|Gurgaon|Gurugram|Noida|Indore|Ahmedabad|Jaipur|Kochi|Coimbatore|Vijayawada|Visakhapatnam|New Delhi|NCR|India)/i
  ];
  
  for (const pattern of locationPatterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[1]) return match[1].trim();
      return match[0].trim();
    }
  }
  return '';
}

function extractYearsOfExperience(text) {
  const lower = text.toLowerCase();
  
  // Pattern 1: Explicit experience mentions
  const explicitPatterns = [
    /(?:total experience|years of experience|experience)[\s:]+(\d+\.?\d*)\s*(?:years?|yrs?|y)/i,
    /(\d+\.?\d*)\s*(?:years?|yrs?|y)\s*(?:of\s*)?(?:experience|exp)/i,
    /(?:experience|exp)[\s:]+(\d+\.?\d*)\s*(?:years?|yrs?|y)/i
  ];
  
  for (const pattern of explicitPatterns) {
    const match = text.match(pattern);
    if (match) {
      const years = parseFloat(match[1]);
      if (!isNaN(years) && years >= 0 && years <= 50) return years;
    }
  }
  
  // Pattern 2: Date range like "2018 - Present" or "2018 to Present"
  const dateRangePatterns = [
    /(?:20\d{2})\s*(?:-|to|–)\s*(?:present|current|20\d{2})/gi,
    /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[\s.]*(?:20\d{2})\s*(?:-|to|–)\s*(?:present|current|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[\s.]*(?:20\d{2}))/gi
  ];
  
  let maxYears = 0;
  for (const pattern of dateRangePatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        const yearMatch = match.match(/(20\d{2})/);
        if (yearMatch) {
          const startYear = parseInt(yearMatch[0]);
          const currentYear = new Date().getFullYear();
          const years = currentYear - startYear;
          if (years > maxYears && years <= 50) maxYears = years;
        }
      }
    }
  }
  
  if (maxYears > 0) return maxYears;
  
  // Pattern 3: Look for "X+ years" or "X yrs" anywhere in text
  const plusPattern = /(\d+\.?\d*)\s*\+?\s*(?:years?|yrs?|y)\b/gi;
  const plusMatch = text.match(plusPattern);
  if (plusMatch) {
    const years = parseFloat(plusMatch[0].match(/(\d+\.?\d*)/)[1]);
    if (!isNaN(years) && years >= 0 && years <= 50) return years;
  }
  
  return 0;
}

function extractCurrentCTC(text) {
  const patterns = [
    /(?:Current CTC|Current Salary|CTC)[\s:]+(?:₹\s*)?([\d,]+(?:\.\d+)?)/i,
    /(?:₹\s*)?([\d,]+(?:\.\d+)?)\s*(?:lakhs?|L|per annum|pa|p\.a\.)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const ctc = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(ctc)) return ctc * 100000;
    }
  }
  return 0;
}

function extractExpectedCTC(text) {
  const patterns = [
    /(?:Expected CTC|Expected Salary|Expected)[\s:]+(?:₹\s*)?([\d,]+(?:\.\d+)?)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const ctc = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(ctc)) return ctc * 100000;
    }
  }
  return 0;
}

function extractNoticePeriod(text) {
  const patterns = [
    /(?:Notice Period|Notice)[\s:]+(.+?)(?:\n|$)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim().substring(0, 50);
    }
  }
  return '';
}

function extractEmploymentType(text) {
  const lower = text.toLowerCase();
  if (lower.includes('full-time') || lower.includes('full time') || lower.includes('permanent')) return 'Full-Time';
  if (lower.includes('part-time') || lower.includes('part time')) return 'Part-Time';
  if (lower.includes('contract') || lower.includes('contractual')) return 'Contract';
  if (lower.includes('intern') || lower.includes('internship')) return 'Internship';
  return 'Full-Time';
}

function extractDesignation(text) {
  const patterns = [
    /(?:Current Designation|Designation|Role|Position|Current Role|Current Position)[\s:]+(.+?)(?:\n|$)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim().substring(0, 100);
    }
  }
  return '';
}

function extractCompany(text) {
  const patterns = [
    /(?:Current Company|Company|Employer|Organization)[\s:]+(.+?)(?:\n|$)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim().substring(0, 100);
    }
  }
  return '';
}

function extractEducation(text) {
  const educationKeywords = ['B.Tech', 'B.E', 'M.Tech', 'M.E', 'MBA', 'B.Sc', 'M.Sc', 'BCA', 'MCA', 'B.Com', 'M.Com', 'PhD', 'Doctorate', 'Bachelor', 'Master', 'Diploma', 'Degree'];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const education = [];
  
  for (const line of lines) {
    for (const keyword of educationKeywords) {
      if (line.includes(keyword)) {
        education.push(line);
        break;
      }
    }
  }
  
  return education.slice(0, 3).join('; ');
}

async function parseResumeText(buffer) {
  const parsed = await pdfParse(buffer);
  const text = parsed.text || '';
  
  return {
    fullName: extractName(text),
    email: extractEmail(text),
    phone: extractPhone(text),
    skills: extractSkills(text),
    location: extractLocation(text),
    yearsOfExperience: extractYearsOfExperience(text),
    ctcCurrent: extractCurrentCTC(text),
    ctcExpected: extractExpectedCTC(text),
    noticePeriod: extractNoticePeriod(text),
    employmentType: extractEmploymentType(text),
    designation: extractDesignation(text),
    company: extractCompany(text),
    education: extractEducation(text),
    resumeText: text
  };
}

module.exports = {
  extractEmail,
  extractPhone,
  extractName,
  extractSkills,
  extractLocation,
  extractYearsOfExperience,
  extractCurrentCTC,
  extractExpectedCTC,
  extractNoticePeriod,
  extractEmploymentType,
  extractDesignation,
  extractCompany,
  extractEducation,
  parseResumeText
};
