import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

describe('App (JourneymanGame) Unit Tests', () => {
  beforeEach(() => {
    render(<App />);
  });

  it('renders the player info form on first load', () => {
    expect(
      screen.getByRole('heading', { level: 4, name: /welcome to journeyman/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /start/i })
    ).toBeInTheDocument();
  });

  it('shows validation error if you click Start with empty fields', async () => {
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    expect(
      await screen.findByText(/please enter both name and email\./i)
    ).toBeInTheDocument();
  });

  it('shows email validation error for invalid email format', async () => {
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: 'Alice' },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    expect(
      await screen.findByText(/please enter a valid email address\./i)
    ).toBeInTheDocument();
  });

  it('navigates to landing page when form is valid', async () => {
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: 'Alice' },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /start/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/choose your mode/i)
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole('button', { name: /easy mode/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /challenge mode/i })
    ).toBeInTheDocument();
  });

  it('starts the easy mode game and shows game header', async () => {
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: 'Alice' },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /start/i }));

    await waitFor(() =>
      screen.getByRole('button', { name: /easy mode/i })
    );
    fireEvent.click(screen.getByRole('button', { name: /easy mode/i }));

    expect(
      await screen.findByTestId('game-header')
    ).toHaveTextContent(/who am i\?/i);

    const imgs = screen.getAllByRole('img');
    expect(imgs.length).toBeGreaterThan(0);
  });
});
