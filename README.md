# Reproduction: MockedProvider permanently suspends useSuspenseQuery components

Based on [`apollographql/react-apollo-error-template`](https://github.com/apollographql/react-apollo-error-template).

## Bug

Components using `useSuspenseQuery` are permanently suspended when tested with
`MockedProvider`. The Suspense fallback renders and never resolves — even with
`findByText` (which polls for up to 3 seconds). The same mock setup works fine
with `useQuery`.

## Reproduce

```sh
npm install
npm test
```

Expected: both tests pass.
Actual: the `useSuspenseQuery` test times out (component stays at "Suspended..." forever).

## Versions

- `@apollo/client`: 3.13.8
- `react` / `react-dom`: 19.1.1
- `vitest`: 3.2.x
- `jsdom`: 26.x

## Root cause

`MockLink` wraps all response delivery in `setTimeout(fn, delay)` (default `delay = 0`):

```js
// node_modules/@apollo/client/testing/core/mocking/mockLink.js
return new Observable(function (observer) {
    var timer = setTimeout(function () {
        // ... observer.next(result) ...
    }, delay);  // delay defaults to 0
});
```

With `useQuery`, this is fine — the component stays mounted (`loading: true`) while waiting,
and the `setTimeout` callback fires on the next tick.

With `useSuspenseQuery`, the component suspends immediately (throws to the Suspense boundary).
The `setTimeout` fires, but the suspended component can no longer receive the data — the
promise `useSuspenseQuery` is waiting on never settles.
