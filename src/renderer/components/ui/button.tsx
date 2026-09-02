import { ButtonHTMLAttributes, ForwardedRef, forwardRef } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost';
};

export const Button = forwardRef(
  (
    { className, variant = 'default', children, ...props }:
      ButtonProps,
    ref: ForwardedRef<HTMLButtonElement>
  ) => {
    const variants: Record<string, string> = {
      default: 'button button-default',
      outline: 'button button-outline',
      ghost: 'button button-ghost'
    };

    return (
      <button
        ref={ref}
        className={[variants[variant], className].filter(Boolean).join(' ')}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
