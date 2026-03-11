import React from "react";

type EmptyStateProps = {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export default function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  if (!title && !description && !icon && !action) return null;

  return (
    <div className={`empty-state vtur-empty-state ${className || ""}`.trim()}>
      {icon && <div className="empty-state-icon vtur-empty-state-icon">{icon}</div>}
      {title && (
        <h3 className="empty-state-title vtur-empty-state-title">
          {title}
        </h3>
      )}
      {description && (
        <p className="empty-state-description vtur-empty-state-description">
          {description}
        </p>
      )}
      {action && <div className="empty-state-actions vtur-empty-state-actions">{action}</div>}
    </div>
  );
}
