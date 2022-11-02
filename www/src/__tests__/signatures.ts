import { extractFromMessage } from "features/web3/signin/hook";

describe("sign/hook", () => {
  it("extractFromMessage", () => {
    const message = `
stuff
stuff

Address: 0x0000000000000000000000000000000000000000
stuff
Timestamp: 2020-08-03T16:05:22.907Z

more stuff`;
    expect(extractFromMessage(message)).toEqual({
      address: "0x0000000000000000000000000000000000000000",
      timestamp: new Date("2020-08-03T16:05:22.907Z").getTime(),
    });
  });
});
