# Reproduction: MockedProvider permanently suspends useSuspenseQuery components

> **Resolution:** This is not a bug in Apollo. The root cause is [RTL's `render()` calling `act()` synchronously](https://github.com/testing-library/react-testing-library/issues/1385) without awaiting the returned thenable. The fix is `await act(() => render(...))`. Apollo's `SuspenseCache` correctly keeps subscriptions alive — the issue is that the microtask/macrotask queue is never flushed within the act scope, so `useSuspenseQuery` never unsuspends.
>
> See the [upstream issue discussion](https://github.com/apollographql/apollo-client/issues/13289) for the Apollo team's response.
>
> **Fix:** `await act(() => render(...))` — tests real Suspense behavior, works with both `useQuery` and `useSuspenseQuery`.

Repro for [apollographql/apollo-client#13289](https://github.com/apollographql/apollo-client/issues/13289).

Based on [`apollographql/react-apollo-error-template`](https://github.com/apollographql/react-apollo-error-template).

## The problem

Components using `useSuspenseQuery` are permanently suspended when tested with
`MockedProvider` using a plain `render()` call. The Suspense fallback renders and
never resolves — even with `findByText` (which polls for up to 3 seconds). The same
mock setup works fine with `useQuery`.

## The fix

```js
import { act } from 'react';

it('works with useSuspenseQuery', async () => {
    await act(() =>
        render(
            <MockedProvider mocks={[mock]} addTypename={false}>
                <Suspense fallback={<div>Loading...</div>}>
                    <MyComponent />
                </Suspense>
            </MockedProvider>,
        ),
    );

    // Component has unsuspended — data is available
    expect(screen.getByText('Hello from mock')).toBeInTheDocument();
});
```

This flushes `MockLink`'s `setTimeout` within the act scope, allowing React to process
the state update and unsuspend the component.

## Reproduce

```sh
npm install
npm test
```

The test suite includes:
- `mocklink-suspense.test.jsx` — demonstrates the failure (plain `render`) and the fix (`await act`)
- `await-act-render.test.jsx` — proves `await act` works for both `useQuery` and `useSuspenseQuery`
- `render-stream.test.jsx` — alternative approach using `@testing-library/react-render-stream`

## Versions

- `@apollo/client`: 3.13.8
- `react` / `react-dom`: 19.1.1
- `vitest`: 3.2.x
- `jsdom`: 26.x

## Why it happens

`MockLink` wraps all response delivery in `setTimeout(fn, delay)` (default `delay = 0`):

```js
// node_modules/@apollo/client/testing/core/mocking/mockLink.js
return new Observable(function (observer) {
    var timer = setTimeout(function () {
        // ... observer.next(result) ...
    }, delay);  // delay defaults to 0
});
```

RTL's `render()` calls `act()` synchronously without awaiting, so:

1. `useSuspenseQuery` suspends (throws to the Suspense boundary)
2. `MockLink` schedules the response in a `setTimeout(fn, 0)` macrotask
3. `act()` returns without flushing the macrotask queue
4. Apollo's `SuspenseCache` keeps the subscription alive, and the response *does* arrive —
   but React never gets a chance to re-render because nothing triggers an update cycle
5. `findByText` polls the DOM but the component stays suspended

`await act(() => render(...))` fixes this because awaiting `act()` flushes pending timers
within the act scope before returning.

## Why useQuery is unaffected

`useQuery` keeps the component mounted (rendering with `loading: true`) while waiting.
RTL's `findByText`/`waitFor` utilities poll the DOM, and when `setTimeout` fires on the
next tick, the Observable subscription triggers a state update → re-render → data appears.
The component was never unmounted, so the subscription was always active.

## Alternative approaches

| Approach | Pros | Cons |
|----------|------|------|
| `await act(() => render(...))` | Tests real Suspense, minimal change | Need to remember the pattern |
| `@testing-library/react-render-stream` | Captures every frame (fallback→data) | Different API, no `act()` |
| SyncMockLink / cache pre-population | Zero test changes needed | Skips Suspense entirely — not testing real behavior |

Per the [Apollo maintainer](https://github.com/apollographql/apollo-client/issues/13289#issuecomment-4798671186):
> If you want your tests to test real application behavior (which uses suspense), any change to your tests that avoids suspending the component kinda defeats the purpose of writing a test.

## Related

- [RTL #1385](https://github.com/testing-library/react-testing-library/issues/1385) — `render` should await `act`
- [RTL #1214](https://github.com/testing-library/react-testing-library/pull/1214) — PR to make `render` async (breaking change)
- [eps1lon/codemod-missing-await-act](https://github.com/eps1lon/codemod-missing-await-act) — codemod to add `await` to all RTL callsites
