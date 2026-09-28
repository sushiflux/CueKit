using Deck.Server;

var app = ServerHost.Build(args);
await ServerHost.InitializeAsync(app.Services);
await app.RunAsync();
