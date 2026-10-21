describe('TemplateManager link attachment behavior', () => {
  // Simulated addAttachment behavior from TemplateManager.js
  const createLinkAttachment = () => ({ type: 'link', name: '', url: '' });

  const updateAttachment = (attachments, index, field, value) => {
    return attachments.map((a, i) => (i === index ? { ...a, [field]: value } : a));
  };

  const simulateTemplateAttachmentsFlow = () => {
    let form = { attachments: [] };
    
    // User clicks "+ Add link"
    form.attachments.push(createLinkAttachment());
    
    // User fills in name and url
    form.attachments = updateAttachment(form.attachments, 0, 'name', 'Job Description');
    form.attachments = updateAttachment(form.attachments, 0, 'url', 'https://example.com/jd');
    
    // User adds another link
    form.attachments.push(createLinkAttachment());
    form.attachments = updateAttachment(form.attachments, 1, 'name', 'Application Form');
    form.attachments = updateAttachment(form.attachments, 1, 'url', 'https://example.com/form');
    
    return form.attachments;
  };

  it('should create link attachment with explicit type: "link"', () => {
    const attachment = createLinkAttachment();
    expect(attachment.type).toBe('link');
    expect(attachment.name).toBe('');
    expect(attachment.url).toBe('');
  });

  it('should preserve type through updates', () => {
    let attachments = [createLinkAttachment()];
    attachments = updateAttachment(attachments, 0, 'name', 'Test');
    attachments = updateAttachment(attachments, 0, 'url', 'https://test.com');
    
    expect(attachments[0].type).toBe('link');
    expect(attachments[0].name).toBe('Test');
    expect(attachments[0].url).toBe('https://test.com');
  });

  it('should build correct template with multiple links', () => {
    const attachments = simulateTemplateAttachmentsFlow();
    expect(attachments.length).toBe(2);
    expect(attachments[0]).toEqual({ type: 'link', name: 'Job Description', url: 'https://example.com/jd' });
    expect(attachments[1]).toEqual({ type: 'link', name: 'Application Form', url: 'https://example.com/form' });
  });

  describe('OutreachController filter simulation', () => {
    // Simulates the filter in outreachController.js:138
    const filterLinkAttachments = (attachments) => {
      return (Array.isArray(attachments) ? attachments : []).filter(a => a && a.type === 'link' && a.url);
    };

    it('should filter out attachments without type field', () => {
      const templateAttachments = [
        { name: 'Link 1', url: 'https://example.com/1' },  // missing type!
        { type: 'link', name: 'Link 2', url: 'https://example.com/2' },
        { type: 'file', attachmentId: 'file123' }
      ];
      
      const result = filterLinkAttachments(templateAttachments);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Link 2');
    });

    it('should include attachments with type: link and url', () => {
      const templateAttachments = [
        { type: 'link', name: 'Link 1', url: 'https://example.com/1' },
        { type: 'link', name: 'Link 2', url: 'https://example.com/2' }
      ];
      
      const result = filterLinkAttachments(templateAttachments);
      expect(result.length).toBe(2);
    });

    it('should exclude file attachments', () => {
      const templateAttachments = [
        { type: 'link', name: 'Link', url: 'https://example.com' },
        { type: 'file', attachmentId: 'file123', name: 'Resume.pdf' }
      ];
      
      const result = filterLinkAttachments(templateAttachments);
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('link');
    });
  });

  describe('AssessmentOutreach handleSend simulation', () => {
    // Simulates the fix in AssessmentOutreach.js handleSend
    const buildAttachmentsPayload = (template, linkAttachments) => {
      const templateLinks = (template.attachments || [])
        .filter(a => a.type === 'link' && a.url)
        .map(a => ({ type: 'link', name: a.name, url: a.url }));
      
      const adHocLinks = linkAttachments
        .filter(a => a.url)
        .map(a => ({ type: 'link', name: a.name, url: a.url }));
      
      return [...templateLinks, ...adHocLinks];
    };

    it('should include type: link in template links sent to backend', () => {
      const template = {
        attachments: [
          { type: 'link', name: 'JD', url: 'https://example.com/jd' }
        ]
      };
      
      const payload = buildAttachmentsPayload(template, []);
      expect(payload[0].type).toBe('link');
    });

    it('should include type: link in ad-hoc links sent to backend', () => {
      const template = { attachments: [] };
      const linkAttachments = [
        { type: 'link', name: 'Manual Link', url: 'https://manual.com' }
      ];
      
      const payload = buildAttachmentsPayload(template, linkAttachments);
      expect(payload[0].type).toBe('link');
    });
  });
});