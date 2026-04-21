import React from 'react';

interface StandardTargetProps {
  is6Ring?: boolean;
}

export const StandardTarget: React.FC<StandardTargetProps> = ({ is6Ring }) => {
  return (
    <g>
      {!is6Ring && (
        <>
          <circle cx="150" cy="150" r="150" fill="white" stroke="#333" strokeWidth="0.5" />
          <circle cx="150" cy="150" r="135" fill="white" stroke="#333" strokeWidth="0.5" />
          <circle cx="150" cy="150" r="120" fill="#333" stroke="#fff" strokeWidth="0.5" />
          <circle cx="150" cy="150" r="105" fill="#333" stroke="#fff" strokeWidth="0.5" />
        </>
      )}
      <circle cx="150" cy="150" r="90" fill="#2F80ED" stroke="#333" strokeWidth="0.5" />
      <circle cx="150" cy="150" r="75" fill="#2F80ED" stroke="#333" strokeWidth="0.5" />
      <circle cx="150" cy="150" r="60" fill="#EB5757" stroke="#333" strokeWidth="0.5" />
      <circle cx="150" cy="150" r="45" fill="#EB5757" stroke="#333" strokeWidth="0.5" />
      <circle cx="150" cy="150" r="30" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
      <circle cx="150" cy="150" r="15" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
      <circle cx="150" cy="150" r="7.5" fill="#F2C94C" stroke="#333" strokeWidth="1" />
    </g>
  );
};