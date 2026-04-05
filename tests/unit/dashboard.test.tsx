import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardPage from '@/app/(admin)/dashboard/page';

describe('DashboardPage', () => {
  it('renders the page heading', () => {
    render(<DashboardPage />);
    expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
  });

  it('renders all four stat cards', () => {
    render(<DashboardPage />);
    expect(screen.getByText("Today's Sales")).toBeInTheDocument();
    expect(screen.getByText('Active Locations')).toBeInTheDocument();
    expect(screen.getByText('Menu Items')).toBeInTheDocument();
    expect(screen.getByText('Staff Members')).toBeInTheDocument();
  });

  it('shows $0.00 for sales when no data', () => {
    render(<DashboardPage />);
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  it('renders the getting started checklist', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByText('Set up your first location')).toBeInTheDocument();
    expect(screen.getByText('Add menu items')).toBeInTheDocument();
    expect(screen.getByText('Invite staff members')).toBeInTheDocument();
    expect(screen.getByText('Configure payment settings')).toBeInTheDocument();
    expect(screen.getByText('Connect receipt printer')).toBeInTheDocument();
  });

  it('shows checklist items as not completed by default', () => {
    render(<DashboardPage />);
    // Items that are done have line-through class; none should here
    const struckItems = document.querySelectorAll('.line-through');
    expect(struckItems).toHaveLength(0);
  });
});
