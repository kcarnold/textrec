import pandas as pd
import click
import pathlib
import json

# from mturk import MTurkClient


def download_gsheet(sheet_url):
    if '/export' not in sheet_url:
        sheet_url = sheet_url.replace('/edit#gid=', '/export?format=csv&gid=')
    return pd.read_csv(sheet_url)


@click.command()
@click.option('--mturk_backup_path', default='mturk-backup')
# @click.option('--profile_name', default='iismturk')
# @click.option('--region_name', default='us-east-1')
@click.option('--transactions', help="CSV of MTurk transaction history")
@click.option('--charge_to', help="CSV of groups by HIT name")
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

    # TODO: validate that all transactions got a chargeto.

    del annotated_transactions['_merge']

    for charge, transactions_for_charge in annotated_transactions.groupby('ChargeTo'):
        for month, transactions_for_charge_month in transactions_for_charge.groupby(pd.Grouper(key='DatePosted', freq='M')):
            if len(transactions_for_charge_month) == 0:
                continue
            month = month.strftime('%Y-%m')
            transactions_for_charge_month.to_csv(f'transactions-{charge}-{month}.csv', index=False)
            print(f'{charge} {month}: ${-transactions_for_charge_month.Amount.sum():.2f}')

if __name__ == '__main__':
    cli()