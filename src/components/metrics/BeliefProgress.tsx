import React, { useState, useEffect } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { formatNumeric } from '../../utils/formatNumeric';
import './BeliefProgress.css';

interface BeliefProgressProps {
  value?: number; // Value between 0 and 1; omitted when the source artifact has no value.
  showTooltip?: boolean;
  className?: string;
  variant?: 'default' | 'sidebar';
}

const BeliefProgress: React.FC<BeliefProgressProps> = ({ 
  value, 
  showTooltip = true, 
  className = '',
  variant = 'default'
}) => {
  const [displayValue, setDisplayValue] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const fillAnimation = useAnimation();
  
  // Ensure value is between 0 and 1
  const hasValue = typeof value === 'number' && Number.isFinite(value);
  const clampedValue = hasValue ? Math.max(0, Math.min(1, value)) : 0;
  const percentage = hasValue ? Math.round(clampedValue * 100) : 0;

  // Calculate dynamic colors based on percentage - Simple blue to yellow to red
  const getProgressColor = (percent: number) => {
    const normalizedValue = percent / 100; // Convert to 0-1 range
    
    let hue, saturation, lightness;
    
    if (normalizedValue <= 0.5) {
      // First half: Light Blue to Yellow (200° to 60°)
      hue = 200 - (normalizedValue * 2) * 140; // 200° to 60°
      saturation = 70 + (normalizedValue * 2) * 20; // 70% to 90%
      lightness = 60 - (normalizedValue * 2) * 10; // 60% to 50%
    } else {
      // Second half: Yellow to Red (60° to 0°)
      const secondHalf = (normalizedValue - 0.5) * 2; // 0 to 1
      hue = 60 - (secondHalf * 60); // 60° to 0°
      saturation = 90 + (secondHalf * 10); // 90% to 100%
      lightness = 50 + (secondHalf * 5); // 50% to 55%
    }
    
    const primaryColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    const glowColor = `hsl(${hue}, ${Math.min(saturation + 10, 100)}%, ${Math.min(lightness + 15, 70)}%)`;
    
    return {
      primary: primaryColor,
      secondary: `hsl(${hue}, ${Math.min(saturation + 15, 100)}%, ${Math.min(lightness + 10, 65)}%)`,
      glow: glowColor
    };
  };

  const colors = getProgressColor(percentage);
  
  // Circle parameters
  const radius = 45;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (clampedValue * circumference);

  useEffect(() => {
    // Animate the circle progress
    fillAnimation.start({
      strokeDashoffset: strokeDashoffset,
      transition: {
        duration: 1.2,
        ease: "easeOut",
        delay: 0.3
      }
    });

    // Animate the number count-up
    const duration = 800;
    const startTime = Date.now();
    const startValue = displayValue;
    const targetValue = percentage;

    const updateValue = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentValue = Math.round(startValue + (targetValue - startValue) * easeOutQuart);
      
      setDisplayValue(currentValue);
      
      if (progress < 1) {
        requestAnimationFrame(updateValue);
      }
    };

    const animationId = requestAnimationFrame(updateValue);
    
    return () => cancelAnimationFrame(animationId);
  }, [value, fillAnimation, percentage, displayValue, strokeDashoffset]);

  return (
    <div 
      className={`belief-progress-circular ${variant === 'sidebar' ? 'belief-progress--sidebar' : ''} ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role={hasValue ? 'progressbar' : 'status'}
      aria-label={hasValue ? `Belief emergence at ${percentage} percent` : 'Belief emergence unavailable'}
      aria-valuenow={hasValue ? percentage : undefined}
      aria-valuemin={hasValue ? 0 : undefined}
      aria-valuemax={hasValue ? 100 : undefined}
    >
      {/* Header */}
      <div className="belief-progress-header">
        <div className="belief-progress-label">
          BELIEF EMERGENCE
        </div>
      </div>

      {/* Circular Progress Container */}
      <div className="circular-progress-container">
        <motion.div 
          className="circular-progress-wrapper"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <svg 
            className="circular-progress-svg" 
            width="120" 
            height="120"
            aria-hidden="true"
            focusable="false"
          >
            {/* Background Circle */}
            <circle
              cx="60"
              cy="60"
              r={radius}
              stroke="rgba(60, 60, 60, 0.3)"
              strokeWidth={strokeWidth}
              fill="none"
              className="progress-bg-circle"
            />
            
            {/* Progress Circle */}
            <motion.circle
              cx="60"
              cy="60"
              r={radius}
              stroke={colors.primary}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={circumference}
              className="progress-circle"
              animate={fillAnimation}
            />
            
            {/* Animated Glow Ring */}
            <motion.circle
              cx="60"
              cy="60"
              r={radius + 3}
              stroke={colors.glow}
              strokeWidth="2"
              fill="none"
              opacity="0.4"
              className="glow-ring"
              animate={{
                scale: [1, 1.05, 1],
                opacity: [0.2, 0.6, 0.2]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          </svg>

          {/* Center Content */}
          <div className="circular-progress-center">
            <motion.div 
              className="belief-progress-value-large"
              animate={{ color: colors.primary }}
              transition={{ duration: 0.5 }}
            >
              {hasValue ? `${displayValue}%` : '—'}
            </motion.div>
            <div className="belief-progress-notation-small">
              <span className="belief-progress-variable">Z</span>
              <span className="belief-progress-equals">=</span>
              <span className="belief-progress-decimal">{hasValue ? formatNumeric(clampedValue, 3) : '—'}</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Tooltip */}
      {variant !== 'sidebar' && showTooltip && (
        <motion.div 
          className="belief-progress-tooltip"
          initial={{ opacity: 0, y: 5 }}
          animate={{ 
            opacity: isHovered ? 1 : 0.7,
            y: isHovered ? 0 : 5
          }}
          transition={{ duration: 0.2 }}
        >
          This value reflects the modeled intensity of belief emergence (Z).
        </motion.div>
      )}

      {/* Color Legend */}
      {variant !== 'sidebar' && (
        <div className="color-legend">
          <div className="legend-item low">
            <div className="legend-color blue"></div>
            <span>Low</span>
          </div>
          <div className="legend-item medium">
            <div className="legend-color yellow"></div>
            <span>Mid</span>
          </div>
          <div className="legend-item high">
            <div className="legend-color red"></div>
            <span>High</span>
          </div>
        </div>
      )}

      {/* Trend Indicator */}
      {variant !== 'sidebar' && hasValue && (
        <div className="belief-progress-trend">
          <motion.div 
            className="trend-indicator"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1.5, duration: 0.3 }}
          >
            <motion.span 
              className="trend-symbol"
              animate={{ color: colors.primary }}
              transition={{ duration: 0.5 }}
            >
              ●
            </motion.span>
            <span className="trend-label">
              {percentage <= 25 ? 'LOW' : 
               percentage <= 50 ? 'MODERATE' : 
               percentage <= 75 ? 'HIGH' : 'CRITICAL'}
            </span>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default BeliefProgress;
