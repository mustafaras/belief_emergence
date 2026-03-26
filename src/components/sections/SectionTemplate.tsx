 
import { motion } from 'framer-motion';
import React from 'react';
import './SectionTemplate.css';

interface SectionTemplateProps {
  title: string;
  sectionIndex: string;
  subtitle?: string;
  description?: string;
  children?: React.ReactNode;
}

const SectionTemplate: React.FC<SectionTemplateProps> = ({
  title,
  sectionIndex,
  subtitle,
  description,
  children
}) => {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="section-template"
    >
      <div className="section-header">
        <div className="section-titles">
          <div className="section-index">{sectionIndex}</div>
          <h2 className="section-title">{title}</h2>
          {subtitle && (
            <p className="section-subtitle">{subtitle}</p>
          )}
          {description && (
            <p className="section-description">{description}</p>
          )}
        </div>
      </div>
      
      <div className="section-content">
        {children || (
          <div className="section-placeholder">
            <p>Content for this section will be implemented in future iterations</p>
          </div>
        )}
      </div>
    </motion.section>
  );
};

export default SectionTemplate;
