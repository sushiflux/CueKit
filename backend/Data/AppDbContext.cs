using Microsoft.EntityFrameworkCore;

namespace Deck.Server.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<DeckEntity> Decks => Set<DeckEntity>();
    public DbSet<PageEntity> Pages => Set<PageEntity>();
    public DbSet<ButtonEntity> Buttons => Set<ButtonEntity>();
    public DbSet<AutomationEntity> Automations => Set<AutomationEntity>();
    public DbSet<DeviceEntity> Devices => Set<DeviceEntity>();
    public DbSet<SettingEntity> Settings => Set<SettingEntity>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<DeckEntity>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(80);
            e.HasMany(x => x.Pages).WithOne(x => x.Deck).HasForeignKey(x => x.DeckId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<PageEntity>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(80);
            e.HasMany(x => x.Buttons).WithOne(x => x.Page).HasForeignKey(x => x.PageId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.DeckId, x.ParentPageId });
        });

        b.Entity<ButtonEntity>(e =>
        {
            e.Property(x => x.Label).HasMaxLength(60);
            e.Property(x => x.Icon).HasMaxLength(120);
            e.Property(x => x.Color).HasMaxLength(24);
            // Ein Slot pro Seite hoechstens einmal belegt - verschieben tauscht serverseitig.
            e.HasIndex(x => new { x.PageId, x.Row, x.Column }).IsUnique();
            // Jedes Tastenkuerzel hoechstens einmal (NULL = kein Kuerzel, beliebig oft erlaubt).
            e.Property(x => x.Hotkey).HasMaxLength(60);
            e.HasIndex(x => x.Hotkey).IsUnique();
        });

        b.Entity<AutomationEntity>(e => e.Property(x => x.Name).HasMaxLength(80));

        b.Entity<DeviceEntity>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(60);
            e.HasIndex(x => x.TokenHash).IsUnique();
        });

        b.Entity<SettingEntity>(e => e.HasKey(x => x.Key));
    }
}
