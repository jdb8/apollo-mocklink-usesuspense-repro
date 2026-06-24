/**
 * Bug: MockedProvider permanently suspends components using useSuspenseQuery.
 *
 * Run: npm install && npm test
 *
 * Expected: Both tests pass — findByText resolves after MockLink delivers data.
 * Actual: The useSuspenseQuery test times out. Component stays at Suspense fallback forever.
 *
 * Root cause: MockLink wraps response delivery in setTimeout(fn, 0), even for delay=0.
 * useSuspenseQuery suspends immediately, and the deferred response never resolves the
 * suspended component's promise.
 */
import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { gql, useSuspenseQuery, useQuery } from "@apollo/client";
import { MockedProvider } from "@apollo/client/testing";
import { describe, it, expect } from "vitest";

const QUERY = gql`
  query GetGreeting {
    greeting {
      message
    }
  }
`;

const mock = {
  request: { query: QUERY },
  result: {
    data: { greeting: { __typename: "Greeting", message: "Hello from mock" } },
  },
};

function SuspenseGreeting() {
  const { data } = useSuspenseQuery(QUERY);
  return <div>{data.greeting.message}</div>;
}

function ClassicGreeting() {
  const { data, loading } = useQuery(QUERY);
  if (loading) return <div>Loading...</div>;
  return <div>{data.greeting.message}</div>;
}

describe("MockLink + useSuspenseQuery", () => {
  it("BUG: useSuspenseQuery stays suspended forever", async () => {
    render(
      <MockedProvider mocks={[mock]} addTypename={false}>
        <Suspense fallback={<div>Suspended...</div>}>
          <SuspenseGreeting />
        </Suspense>
      </MockedProvider>
    );

    // This times out. The component renders "Suspended..." and never resolves.
    expect(
      await screen.findByText("Hello from mock", {}, { timeout: 3000 })
    ).toBeInTheDocument();
  });

  it("useQuery works fine (for comparison)", async () => {
    render(
      <MockedProvider mocks={[mock]} addTypename={false}>
        <ClassicGreeting />
      </MockedProvider>
    );

    // This passes — useQuery keeps the component mounted while loading.
    expect(await screen.findByText("Hello from mock")).toBeInTheDocument();
  });
});
