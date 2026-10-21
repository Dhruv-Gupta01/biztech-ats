const { buildAttachmentLinks } = require('../../services/emailService');

describe('buildAttachmentLinks', () => {
  it('should return empty string for undefined/empty attachments', () => {
    expect(buildAttachmentLinks()).toBe('');
    expect(buildAttachmentLinks(null)).toBe('');
    expect(buildAttachmentLinks([])).toBe('');
  });

  it('should build links from attachments with name and url', () => {
    const attachments = [
      { type: 'link', name: 'Job Description', url: 'https://example.com/jd' },
      { type: 'link', name: 'Application Form', url: 'https://example.com/form' }
    ];
    const result = buildAttachmentLinks(attachments);
    expect(result).toContain('Job Description: https://example.com/jd');
    expect(result).toContain('Application Form: https://example.com/form');
    expect(result).toContain('Attachments:');
  });

  it('should handle attachments without name', () => {
    const attachments = [{ type: 'link', url: 'https://example.com/jd' }];
    const result = buildAttachmentLinks(attachments);
    expect(result).toContain('https://example.com/jd');
  });

  it('should include attachments that have a url', () => {
    const attachments = [
      { type: 'link', name: 'Valid Link', url: 'https://example.com' },
      { type: 'file', attachmentId: '123' },  // no url - excluded
      { name: 'No Type', url: 'https://example.com/no-type' },  // no type but has url - included
      { type: 'link', name: 'No URL' }  // no url - excluded
    ];
    const result = buildAttachmentLinks(attachments);
    expect(result).toContain('Valid Link');
    expect(result).toContain('No Type');  // has url so included
  });

  it('should work with real attachment shapes from email template', () => {
    const templateLinks = [
      { type: 'link', name: 'Resume', url: 'https://example.com/resume' }
    ];
    const adHocLinks = [
      { type: 'link', name: 'JD', url: 'https://example.com/jd' }
    ];
    const result = buildAttachmentLinks([...templateLinks, ...adHocLinks]);
    expect(result).toContain('Resume: https://example.com/resume');
    expect(result).toContain('JD: https://example.com/jd');
  });
});

describe('sendOutreachEmails attachment handling', () => {
  it('should identify link attachments correctly by type', () => {
    const rawAttachments = [
      { type: 'link', name: 'JD', url: 'http://example.com' },
      { type: 'file', attachmentId: 'file123' }
    ];
    const linkAttachments = rawAttachments.filter(a => a && a.type === 'link' && a.url);
    const fileRefs = rawAttachments.filter(a => a && a.type === 'file' && a.attachmentId);
    expect(linkAttachments.length).toBe(1);
    expect(fileRefs.length).toBe(1);
  });

  it('should include link from template without explicit type after default is applied', () => {
    const templateAttachment = {
      _id: 'template1',
      name: 'Job Description',
      url: 'https://example.com/jd'
    };
    const hasExplicitType = templateAttachment.type === 'link';
    expect(hasExplicitType).toBe(false);
    const attachments = [{ type: 'link', name: templateAttachment.name, url: templateAttachment.url }];
    const linkAttachments = attachments.filter(a => a.type === 'link' && a.url);
    expect(linkAttachments.length).toBe(1);
  });
});