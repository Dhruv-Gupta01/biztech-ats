const express = require('express');
const router = express.Router();
const Project = require('../models/Project');

// GET /api/projects — list all projects (defaults seeded on first read)
router.get('/', async (req, res) => {
  try {
    const count = await Project.countDocuments();
    if (count === 0) {
      await Project.insertMany([
        { name: 'Terminus' }, { name: 'Snorkle' }, { name: 'Alegion' }
      ]);
    }
    const projects = await Project.find().sort({ name: 1 });
    return res.status(200).json({ success: true, count: projects.length, data: projects });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while fetching projects.' });
  }
});

// POST /api/projects — add a new project from the frontend
router.post('/', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Project name is required.' });
    const existing = await Project.findOne({ name });
    if (existing) return res.status(200).json({ success: true, data: existing });
    const project = await Project.create({ name });
    return res.status(201).json({ success: true, data: project });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while creating project.' });
  }
});

// DELETE /api/projects/:id
router.delete('/:id', async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });
    return res.status(200).json({ success: true, message: 'Project removed.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while deleting project.' });
  }
});

module.exports = router;
