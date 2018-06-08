import pandas as pd
import click
import pathlib
import json


@click.command()
@click.option('--mturk_backup_path', default='mturk-backup', help="Output of the backup_mturk script")
@click.option('--transactions', required=True, help="CSV of MTurk transaction history, downloaded from https://requester.mturk.com/transaction_history/search")
@click.option('--charge_to', required=True, help="CSV of groups by HIT name, with columns Title and ChargeTo")
def cli(mturk_backup_path, transactions, charge_to):
    # Load HIT data
    mturk_backup_path = pathlib.Path(mturk_backup_path)
    hits = [json.load(open(f)) for f in mturk_backup_path.glob('*/meta.json')]
    hits = pd.DataFrame(hits)
    hits = hits.loc[:,['HITId', 'Title']]#, 'CreationTime']]
    # hits.CreationTime = pd.to_datetime(hits.CreationTime)
    hits['Title'] = hits['Title'].str.strip()

    # Load transactions
    transactions = pd.read_csv(transactions)
    transactions = transactions.rename(columns={
        'HIT ID': 'HITId',
        'Date Posted': "DatePosted"
        })
    transactions.DatePosted = pd.to_datetime(transactions.DatePosted)
    del transactions['Date Initiated']
    transactions = transactions[transactions['Transaction Type'] != 'Prepayment']

    # Load charge-tos
    charge_to = pd.read_csv(charge_to)
    charge_to['Title'] = charge_to['Title'].str.strip()

    # Find where to charge all HITs.
    hits_with_chargeto = pd.merge(
        hits,
        charge_to,
        on='Title',
        how='left', validate='m:1', indicator=True)
    hits_without_chargeto = hits_with_chargeto[hits_with_chargeto['_merge'] == 'left_only']
    if len(hits_without_chargeto) > 0:
        print("Warning: uncharged HITs:")
        print('\n'.join(hits_without_chargeto.Title))

    del hits_with_chargeto['_merge']

    # Map transactions to HITs and charges.
    annotated_transactions = pd.merge(
        transactions,
        hits_with_chargeto,
        on='HITId',
        how='left', validate='m:1', indicator=True)

    xactions_without_chargeto = annotated_transactions[annotated_transactions['_merge'] == 'left_only']
    if len(xactions_without_chargeto) > 0:
        print("Warning: uncharged transactions:")
        print('\n'.join(xactions_without_chargeto.Title))

    assert annotated_transactions['_merge'].value_counts()['both'] == len(annotated_transactions), annotated_transactions['_merge'].value_counts()
    del annotated_transactions['_merge']

    for charge, transactions_for_charge in annotated_transactions.groupby('ChargeTo'):
        transactions_for_charge = transactions_for_charge.sort_values('DatePosted', kind='mergesort')
        earliest = transactions_for_charge.DatePosted.min().strftime('%Y-%m-%d')
        latest = transactions_for_charge.DatePosted.max().strftime('%Y-%m-%d')
        print(f'{charge} total: ${-transactions_for_charge.Amount.sum():.2f} ({earliest} to {latest})')
        transactions_for_charge.drop(['ChargeTo'], axis=1).to_csv(f'transactions-{charge}_{earliest}_to_{latest}.csv', index=False)
        for title, amount in (-transactions_for_charge.groupby('Title').Amount.sum()).items():
            print(f' ${amount:0.2f} {title}')
        print()
if __name__ == '__main__':
    cli()
