import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { QueryProvider } from '@/lib/providers/query-provider';

function TestComponent() {
  const { data, isLoading } = useQuery({
    queryKey: ['test'],
    queryFn: () => Promise.resolve('hello'),
  });
  return <div>{isLoading ? 'loading' : data}</div>;
}

describe('QueryProvider', () => {
  it('renders children', () => {
    render(
      <QueryProvider>
        <div>child content</div>
      </QueryProvider>
    );
    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('provides query context to children', async () => {
    render(
      <QueryProvider>
        <TestComponent />
      </QueryProvider>
    );
    // Initially loading
    expect(screen.getByText('loading')).toBeInTheDocument();
  });
});
